-- Confirmation belongs to a visit, never to a recurring arrangement or a calendar day.
alter table public.quotes add column if not exists manual_only boolean not null default false;
alter table public.quotes add column if not exists manual_follow_up_state text not null default 'active'
  check (manual_follow_up_state in ('active','ready_to_book','waiting','owner','stopped'));
alter table public.quote_responses add column if not exists handled_at timestamptz;
alter table public.record_notes drop constraint if exists record_notes_outcome_code_check;
alter table public.record_notes add constraint record_notes_outcome_code_check check (
 outcome_code is null or outcome_code in ('voicemail_left','sms_sent','email_sent','messenger_sent','no_answer','spoke_thinking','ready_to_book','call_on_date','customer_will_contact','owner_handling','declined','do_not_contact'));

create table public.booking_visits (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique,
 recurring_job_id text references public.recurring_jobs(id) on delete restrict,
 job_id text references public.jobs(id) on delete restrict,
 client_id text references public.clients(id) on delete restrict,
 calendar_event_id text,
 occurrence_date date,
 due_month date check (due_month is null or extract(day from due_month)=1),
 work_type text not null default 'new' check (work_type in ('recurring','new','legacy')),
 status text not null default 'needs_booking' check (status in ('needs_booking','awaiting_reply','ready_to_book','waiting','owner','deferred','skipped','stopped','confirmed')),
 high_priority boolean not null default false,
 next_contact_date date,
 last_contact_at timestamptz,
 last_outcome text,
 contact_channel text,
 attempt_count integer not null default 0 check (attempt_count>=0),
 confirmed_date date,
 confirmed_at timestamptz,
 confirmed_by uuid references auth.users(id),
 history jsonb not null default '[]'::jsonb,
 setup_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint confirmed_visit_requires_agreement check (status <> 'confirmed' or (confirmed_date is not null and confirmed_at is not null and confirmed_by is not null and calendar_event_id is not null)),
 unique(recurring_job_id,occurrence_date)
);
create unique index booking_visits_event_idx on public.booking_visits(calendar_event_id) where calendar_event_id is not null;
create index booking_visits_queue_idx on public.booking_visits(due_month,next_contact_date) where status not in ('confirmed','skipped','stopped');
alter table public.booking_visits enable row level security;
grant select,insert,update on public.booking_visits to authenticated;
create policy booking_visits_staff on public.booking_visits for all to authenticated
 using ((select app_private.current_staff_role()) in ('admin','customer_service'))
 with check ((select app_private.current_staff_role()) in ('admin','customer_service'));

-- Idempotent: advancing next_date never carries a previous visit's confirmation forward.
create function public.sync_booking_visits() returns void language plpgsql security invoker set search_path='' as $$
declare r record; d date; cutoff date := (current_date + interval '13 months')::date; step integer;
begin
 for r in select * from public.recurring_jobs where active and next_date is not null loop
  step := coalesce(r.custom_days,case r.frequency when 'weekly' then 7 when 'fortnightly' then 14 when 'monthly' then 30 when '6weekly' then 42 when 'bimonthly' then 61 when 'quarterly' then 91 when '6monthly' then 182 when 'annually' then 365 else null end);
  if step is null or step<1 then continue; end if;
  d:=r.next_date;
  while d<=cutoff loop
   insert into public.booking_visits(source_key,recurring_job_id,client_id,occurrence_date,due_month,work_type,next_contact_date)
   values ('recurring:'||r.id||':'||d,r.id,r.client_id,d,date_trunc('month',d)::date,'recurring',date_trunc('month',d)::date-14)
   on conflict do nothing;
   d:=d+step;
  end loop;
 end loop;
 insert into public.booking_visits(source_key,recurring_job_id,client_id,work_type,setup_note)
 select 'recurring:'||id||':undated',id,client_id,'recurring','Set the next service month in the CRM.' from public.recurring_jobs where active and next_date is null on conflict do nothing;
 insert into public.booking_visits(source_key,job_id,client_id,calendar_event_id,work_type)
 select 'job:'||id,id,client_id,google_calendar_event_id,'new' from public.jobs
 where lower(status)='active' and coalesce(trim(completion_date),'')=''
 on conflict do nothing;
end $$;
revoke all on function public.sync_booking_visits() from public,anon;
grant execute on function public.sync_booking_visits() to authenticated;

create function public.save_booking_visit(p_id uuid,p_changes jsonb,p_note text,p_expected_at timestamptz)
returns public.booking_visits language plpgsql security invoker set search_path='' as $$
declare v public.booking_visits; actor text;
begin
 select * into v from public.booking_visits where id=p_id for update;
 if not found then raise exception 'Visit unavailable'; end if;
 if v.updated_at is distinct from p_expected_at then raise exception 'This visit changed. Refresh before saving.'; end if;
 select display_name into actor from public.staff_profiles where auth_user_id=auth.uid();
 update public.booking_visits set
  status=coalesce(p_changes->>'status',status),
  high_priority=coalesce((p_changes->>'high_priority')::boolean,high_priority),
  due_month=case when p_changes ? 'due_month' then (p_changes->>'due_month')::date else due_month end,
  next_contact_date=case when p_changes ? 'next_contact_date' then (p_changes->>'next_contact_date')::date else next_contact_date end,
  calendar_event_id=coalesce(p_changes->>'calendar_event_id',calendar_event_id),
  last_contact_at=case when p_changes ? 'last_outcome' then now() else last_contact_at end,
  last_outcome=coalesce(p_changes->>'last_outcome',last_outcome),
  contact_channel=coalesce(p_changes->>'contact_channel',contact_channel),
  attempt_count=coalesce((p_changes->>'attempt_count')::integer,attempt_count),
  confirmed_date=case when p_changes ? 'confirmed_date' then (p_changes->>'confirmed_date')::date else confirmed_date end,
  confirmed_at=case when p_changes->>'status'='confirmed' then now() when p_changes ? 'status' then null else confirmed_at end,
  confirmed_by=case when p_changes->>'status'='confirmed' then auth.uid() when p_changes ? 'status' then null else confirmed_by end,
  history=history||jsonb_build_array(jsonb_build_object('at',now(),'by',coalesce(actor,'Staff'),'user_id',auth.uid(),'note',p_note,'changes',p_changes)),
  updated_at=clock_timestamp()
 where id=p_id returning * into v;
 if v.status='confirmed' and v.job_id is not null then
  update public.jobs set completion_date=v.confirmed_date::text,google_calendar_event_id=v.calendar_event_id where id=v.job_id;
 end if;
 return v;
end $$;
revoke all on function public.save_booking_visit(uuid,jsonb,text,timestamptz) from public,anon;
grant execute on function public.save_booking_visit(uuid,jsonb,text,timestamptz) to authenticated;

-- Save the schedule, outcome and response acknowledgement in one transaction.
create function public.record_quote_contact(p_quote_id text,p_outcome text,p_note text,p_next_date date,p_channel text,p_manual boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare q public.quotes; actor text; state text;
begin
 select * into q from public.quotes where id=p_quote_id and status='pending' and deleted_at is null for update;
 if not found then raise exception 'Pending quote unavailable'; end if;
 if p_outcome='call_on_date' and p_next_date is null then raise exception 'Choose the next contact date'; end if;
 state:=case p_outcome when 'ready_to_book' then 'ready_to_book' when 'customer_will_contact' then 'waiting' when 'owner_handling' then 'owner' when 'declined' then 'stopped' when 'do_not_contact' then 'stopped' else 'active' end;
 if state='active' and p_next_date is null then raise exception 'A continuing follow-up needs a next date'; end if;
 select display_name into actor from public.staff_profiles where auth_user_id=auth.uid();
 insert into public.record_notes(record_type,record_id,body,author_id,author_name,source,outcome_code,next_contact_date,action_result)
 values ('quote',p_quote_id,p_note,auth.uid()::text,coalesce(actor,'Staff'),'call_dashboard',p_outcome,p_next_date,
 case when state='stopped' then 'suppressed' when state='ready_to_book' then 'completed' else 'deferred' end);
 update public.quotes set
 manual_follow_up_at=case when p_next_date is not null then (p_next_date+time '10:00') at time zone 'Australia/Melbourne' else null end,
 manual_follow_up_state=state,
 last_follow_up_at=case when p_manual then now() else last_follow_up_at end,
 next_follow_up_at=null,follow_up_paused_until=null,follow_up_enabled=false
 where id=p_quote_id;
 update public.quote_responses set handled_at=now() where quote_id=p_quote_id and handled_at is null and created_at<=now();
end $$;
revoke all on function public.record_quote_contact(text,text,text,date,text,boolean) from public,anon;
grant execute on function public.record_quote_contact(text,text,text,date,text,boolean) to authenticated;

alter table public.recurring_jobs add column if not exists source_calendar_event_id text unique;
alter table public.recurring_jobs add column if not exists source_calendar_series_id text unique;
alter table public.recurring_jobs add column if not exists legacy_recurrence_rule text;

create function public.import_calendar_booking(p_event jsonb,p_client_id text,p_kind text,p_existing_recurring_id text,p_service text,p_frequency text,p_due_month date,p_amount numeric)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.clients; rid text; jid text; vid uuid; existing public.booking_visits; original_day date;
begin
 if (select app_private.current_staff_role()) is null or (select app_private.current_staff_role()) not in ('admin','customer_service') then raise exception 'Staff access required'; end if;
 if nullif(p_event->>'id','') is null or nullif(trim(p_service),'') is null then raise exception 'Event and service required'; end if;
 select * into existing from public.booking_visits where calendar_event_id=p_event->>'id';
 if found then return existing.id; end if;
 select * into c from public.clients where id=p_client_id;
 if not found then raise exception 'Choose an existing customer profile'; end if;
 original_day:=coalesce((p_event->'originalStartTime'->>'date')::date,substring(p_event->'originalStartTime'->>'dateTime' from 1 for 10)::date,p_due_month);
 if p_kind='recurring' then
  if p_existing_recurring_id is not null then
   select id into rid from public.recurring_jobs where id=p_existing_recurring_id and (client_id=c.id or (client_id is null and lower(client)=lower(c.name)));
   if not found then raise exception 'Recurring arrangement does not match customer'; end if;
  else
   if p_frequency not in ('weekly','fortnightly','monthly','6weekly','bimonthly','quarterly','6monthly','annually') then raise exception 'Select the verified frequency'; end if;
   if p_due_month is null then raise exception 'Service month required for a recurring arrangement'; end if;
   rid:='REC-CAL-'||md5(p_event->>'id');
   insert into public.recurring_jobs(id,client,client_id,service,revenue,frequency,next_date,notes,source_calendar_event_id,source_calendar_series_id,legacy_recurrence_rule)
   values(rid,c.name,c.id,p_service,coalesce(p_amount,0),p_frequency,coalesce(original_day,p_due_month),
    'Imported from Google Calendar. Verify pricing before booking.'||chr(10)||coalesce(p_event->>'summary','')||chr(10)||coalesce(p_event->>'description',''),
    p_event->>'id',p_event->>'recurringEventId',p_event->>'recurrence_rule');
  end if;
 else
  jid:='J-CAL-'||md5(p_event->>'id');
  insert into public.jobs(id,client,client_id,service,status,revenue,notes,google_calendar_event_id)
  values(jid,c.name,c.id,p_service,'Active',coalesce(p_amount,0),'Imported calendar record. Verify scope and pricing.'||chr(10)||coalesce(p_event->>'summary','')||chr(10)||coalesce(p_event->>'description',''),p_event->>'id');
 end if;
 if rid is not null then
  select id into vid from public.booking_visits where recurring_job_id=rid and due_month=p_due_month order by occurrence_date limit 1;
 end if;
 if vid is not null then
  update public.booking_visits set calendar_event_id=p_event->>'id',client_id=c.id,setup_note='Imported calendar record. Scope and pricing require review.' where id=vid;
 else
  insert into public.booking_visits(source_key,recurring_job_id,job_id,client_id,calendar_event_id,occurrence_date,due_month,work_type,setup_note)
  values(case when rid is not null then 'recurring:'||rid||':'||original_day else 'job:'||jid end,rid,jid,c.id,p_event->>'id',original_day,p_due_month,
  case when rid is not null then 'recurring' else 'new' end,'Imported calendar record. Scope and pricing require review.') returning id into vid;
 end if;
 return vid;
end $$;
revoke all on function public.import_calendar_booking(jsonb,text,text,text,text,text,date,numeric) from public,anon;
grant execute on function public.import_calendar_booking(jsonb,text,text,text,text,text,date,numeric) to authenticated;
