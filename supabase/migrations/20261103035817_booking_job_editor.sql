-- Job edits are independent of customer confirmation and retain an audit trail.
alter table public.jobs add column updated_at timestamptz not null default now(), add column archived_at timestamptz, add column deleted_at timestamptz, add column archive_snapshot jsonb;
alter table public.recurring_jobs add column updated_at timestamptz not null default now(), add column archived_at timestamptz, add column deleted_at timestamptz, add column archive_snapshot jsonb;
alter table public.booking_visits add column service_override jsonb, add column archived_at timestamptz, add column archive_reason text;
create function public.touch_booking_job_version() returns trigger language plpgsql security invoker set search_path='' as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
revoke all on function public.touch_booking_job_version() from public,anon;
grant execute on function public.touch_booking_job_version() to authenticated,service_role;
create trigger jobs_booking_version before update on public.jobs for each row execute function public.touch_booking_job_version();
create trigger recurring_booking_version before update on public.recurring_jobs for each row execute function public.touch_booking_job_version();

create function public.edit_booking_job(p_visit_id uuid,p_scope text,p_changes jsonb,p_expected_visit_at timestamptz,p_expected_record_at timestamptz,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.booking_visits; r public.recurring_jobs; j public.jobs; before_record jsonb; after_record jsonb;
 old_service jsonb; service_data jsonb; line jsonb; normalized jsonb:='[]'::jsonb; qty numeric; rate numeric; total numeric:=0;
 actor text; record_type text; record_id text; edit_frequency text; edit_custom_days integer; next_day date; plan_changed boolean:=false; edit_note text;
begin
 if (select app_private.current_staff_role()) is null or (select app_private.current_staff_role()) not in ('admin','customer_service') then raise exception 'Staff access required'; end if;
 select * into v from public.booking_visits where id=p_visit_id for update;
 if not found or v.archived_at is not null then raise exception 'Visit unavailable'; end if;
 if v.updated_at is distinct from p_expected_visit_at then raise exception 'This visit changed. Reopen it before saving.'; end if;
 if v.booking_lock_until>now() then raise exception 'This booking is being confirmed. Try again shortly.'; end if;
 if v.recurring_job_id is not null then
  select * into r from public.recurring_jobs where id=v.recurring_job_id for update;
  if not found or not r.active or r.deleted_at is not null then raise exception 'Recurring job is archived or unavailable'; end if;
  if r.updated_at is distinct from p_expected_record_at then raise exception 'The recurring arrangement changed. Refresh before saving.'; end if;
  if p_scope not in ('visit','future') then raise exception 'Choose this visit or the recurring arrangement'; end if;
  before_record:=to_jsonb(r); record_type:='recurring_job';record_id:=r.id;
 else
  select * into j from public.jobs where id=v.job_id for update;
  if not found or lower(j.status)<>'active' or j.deleted_at is not null then raise exception 'Active job unavailable'; end if;
  if j.updated_at is distinct from p_expected_record_at then raise exception 'This job changed. Refresh before saving.'; end if;
  if p_scope<>'job' then raise exception 'Choose the job scope'; end if;
  if exists(select 1 from public.invoices where job_id=j.id) then raise exception 'This job has an invoice. Review the invoice in the CRM before changing its scope or price.'; end if;
  before_record:=to_jsonb(j);record_type:='job';record_id:=j.id;
 end if;
 if nullif(btrim(p_changes->>'service'),'') is null then raise exception 'Enter a service summary'; end if;
 if jsonb_typeof(p_changes->'items') is distinct from 'array' then raise exception 'Add at least one service item'; end if;
 if jsonb_array_length(p_changes->'items') not between 1 and 50 then raise exception 'Use between 1 and 50 service items'; end if;
 for line in select value from jsonb_array_elements(p_changes->'items') loop
  if nullif(btrim(line->>'description'),'') is null then raise exception 'Every item needs a description'; end if;
  qty:=(line->>'qty')::numeric;rate:=(line->>'rate')::numeric;
  if qty is null or rate is null or qty<=0 or qty>1000000 or abs(rate)>10000000 or qty='NaN'::numeric or rate='NaN'::numeric then raise exception 'Enter valid quantities and unit prices'; end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('description',btrim(line->>'description'),'qty',qty,'rate',rate,'unit',coalesce(line->>'unit',''),'total',round(qty*rate,2)));
  total:=total+round(qty*rate,2);
 end loop;
 if total<0 then raise exception 'Job total cannot be negative'; end if;
 if coalesce((p_changes->>'hours')::numeric,0)<0 then raise exception 'Hours cannot be negative'; end if;
 old_service:=jsonb_build_object('service',before_record->'service','description',before_record->'description','items',before_record->'items','revenue',before_record->'revenue','hours',before_record->'hours');
 service_data:=jsonb_build_object('service',btrim(p_changes->>'service'),'description',coalesce(p_changes->>'description',''),'items',normalized,'revenue',total,'hours',coalesce((p_changes->>'hours')::numeric,0));
 if p_scope='visit' then
  update public.booking_visits set service_override=service_data,updated_at=clock_timestamp() where id=v.id;
  after_record:=before_record||service_data;
 elsif p_scope='future' then
  edit_frequency:=coalesce(nullif(p_changes->>'frequency',''),r.frequency);
  if edit_frequency not in ('weekly','fortnightly','monthly','6weekly','bimonthly','quarterly','6monthly','annually','custom') then raise exception 'Choose a recurrence frequency'; end if;
  edit_custom_days:=case when edit_frequency='custom' then (p_changes->>'custom_days')::integer else null end;
  if edit_frequency='custom' and (edit_custom_days is null or edit_custom_days<1 or edit_custom_days>3650) then raise exception 'Custom interval must be between 1 and 3650 days'; end if;
  next_day:=case when p_changes ? 'next_month' then case when nullif(p_changes->>'next_month','') is null then null when substring(r.next_date::text,1,7)=p_changes->>'next_month' then r.next_date else (p_changes->>'next_month'||'-01')::date end else r.next_date end;
  plan_changed:=edit_frequency is distinct from r.frequency or edit_custom_days is distinct from r.custom_days or next_day is distinct from r.next_date;
  if exists(select 1 from public.booking_visits where recurring_job_id=r.id and booking_lock_until>now()) then raise exception 'Another visit is being confirmed. Try again shortly.'; end if;
  if plan_changed and v.status='confirmed' then raise exception 'Change the recurrence from an unconfirmed visit. This visit already has an agreed date.'; end if;
  if plan_changed and exists(select 1 from public.booking_visits where recurring_job_id=r.id and id<>v.id and status='confirmed' and coalesce(occurrence_date,confirmed_date)>=coalesce(v.occurrence_date,current_date) and archived_at is null) then raise exception 'Future visits are already confirmed. Review those dates before changing the recurrence schedule.'; end if;
  -- Preserve agreed services on other confirmed visits and work preceding this visit.
  update public.booking_visits set service_override=old_service,updated_at=clock_timestamp()
   where recurring_job_id=r.id and id<>v.id and service_override is null and (status='confirmed' or occurrence_date<coalesce(v.occurrence_date,r.next_date,current_date));
  update public.recurring_jobs set service=service_data->>'service',description=service_data->>'description',items=normalized,revenue=total,hours=(service_data->>'hours')::numeric,frequency=edit_frequency,custom_days=edit_custom_days,next_date=next_day,
   legacy_recurrence_rule=case when plan_changed then null else legacy_recurrence_rule end where id=r.id returning to_jsonb(recurring_jobs.*) into after_record;
  update public.booking_visits set service_override=null,updated_at=clock_timestamp() where id=v.id;
  if plan_changed then
   update public.booking_visits set archived_at=now(),archive_reason='schedule_replaced',updated_at=clock_timestamp() where recurring_job_id=r.id and id<>v.id and status<>'confirmed' and archived_at is null and (occurrence_date>=coalesce(v.occurrence_date,current_date) or occurrence_date is null);
   if exists(select 1 from public.booking_visits where recurring_job_id=r.id and id<>v.id and (occurrence_date=next_day or (occurrence_date is null and next_day is null))) then raise exception 'A visit already exists for the new starting date. Open that visit to change the recurrence.'; end if;
   update public.booking_visits set occurrence_date=next_day,due_month=date_trunc('month',next_day)::date,source_key='recurring:'||r.id||':'||coalesce(next_day::text,'undated'),updated_at=clock_timestamp() where id=v.id;
   perform public.sync_booking_visits();
  end if;
 else
  update public.jobs set service=service_data->>'service',description=service_data->>'description',items=normalized,revenue=total,hours=(service_data->>'hours')::numeric where id=j.id returning to_jsonb(jobs.*) into after_record;
  update public.booking_visits set updated_at=clock_timestamp() where id=v.id;
 end if;
 select display_name into actor from public.staff_profiles where auth_user_id=auth.uid();
 edit_note:=case p_scope when 'visit' then 'Updated this visit only.' when 'future' then 'Updated this visit and the recurring arrangement. Existing individual visit changes and other confirmed visits retained.' else 'Updated job details.' end||E'
'||(service_data->>'service')||' — $'||total::text||case when nullif(btrim(p_reason),'') is not null then E'
'||btrim(p_reason) else '' end;
 insert into public.record_notes(record_type,record_id,body,author_id,author_name,source,booking_visit_id) values(record_type,record_id,edit_note,auth.uid()::text,coalesce(actor,'Staff'),'call_dashboard',v.id);
 update public.booking_visits set history=history||jsonb_build_array(jsonb_build_object('at',now(),'by',coalesce(actor,'Staff'),'user_id',auth.uid(),'note',edit_note,'changes',jsonb_build_object('job_edit',jsonb_build_object('scope',p_scope,'before',before_record,'previous_override',v.service_override,'after',after_record)))),updated_at=clock_timestamp() where id=v.id;
 return jsonb_build_object('record',case when p_scope='visit' then before_record else after_record end,'visits',(select jsonb_agg(to_jsonb(b)) from public.booking_visits b where (v.recurring_job_id is not null and b.recurring_job_id=v.recurring_job_id) or b.id=v.id));
end $$;
revoke all on function public.edit_booking_job(uuid,text,jsonb,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.edit_booking_job(uuid,text,jsonb,timestamptz,timestamptz,text) to authenticated;

create function public.manage_booking_job(p_kind text,p_id text,p_action text,p_expected_at timestamptz,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.recurring_jobs;j public.jobs;before_record jsonb;after_record jsonb;actor text;note text;kind text;
begin
 if (select app_private.current_staff_role()) is null or (select app_private.current_staff_role()) not in ('admin','customer_service') then raise exception 'Staff access required'; end if;
 if p_action not in ('archive','delete','restore') then raise exception 'Choose an action'; end if;
 if p_action<>'restore' and nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason'; end if;
 if p_kind='recurring_job' then
  select * into r from public.recurring_jobs where id=p_id for update;
  if not found then raise exception 'Recurring job unavailable'; end if;
  if r.updated_at is distinct from p_expected_at then raise exception 'Job changed. Refresh before continuing.'; end if;
  if exists(select 1 from public.booking_visits where recurring_job_id=r.id and booking_lock_until>now()) then raise exception 'A visit is being confirmed. Try again shortly.'; end if;
  before_record:=to_jsonb(r);kind:='recurring_job';
  if p_action='restore' and r.archived_at is null and r.deleted_at is null then raise exception 'This arrangement is not archived'; end if;
  update public.recurring_jobs set
   archive_snapshot=case when p_action='restore' then null else coalesce(archive_snapshot,before_record) end,
   active=case when p_action='restore' then coalesce((archive_snapshot->>'active')::boolean,true) else false end,
   archived_at=case when p_action='restore' then null else coalesce(archived_at,now()) end,
   deleted_at=case when p_action='restore' then null when p_action='delete' then now() else deleted_at end
   where id=p_id returning to_jsonb(recurring_jobs.*) into after_record;
 elsif p_kind='job' then
  select * into j from public.jobs where id=p_id for update;
  if not found then raise exception 'Job unavailable'; end if;
  if j.updated_at is distinct from p_expected_at then raise exception 'Job changed. Refresh before continuing.'; end if;
  if exists(select 1 from public.booking_visits where job_id=j.id and booking_lock_until>now()) then raise exception 'Job is being confirmed. Try again shortly.'; end if;
  if p_action='restore' and j.archived_at is null and j.deleted_at is null then raise exception 'This job is not archived'; end if;
  before_record:=to_jsonb(j);kind:='job';
  update public.jobs set archive_snapshot=case when p_action='restore' then null else coalesce(archive_snapshot,before_record) end,
   status=case when p_action='restore' then coalesce(archive_snapshot->>'status','Active') else 'Archived' end,
   archived_at=case when p_action='restore' then null else coalesce(archived_at,now()) end,
   deleted_at=case when p_action='restore' then null when p_action='delete' then now() else deleted_at end
   where id=p_id returning to_jsonb(jobs.*) into after_record;
 else raise exception 'Choose a job';end if;
 select display_name into actor from public.staff_profiles where auth_user_id=auth.uid();
 note:=case p_action when 'restore' then 'Restored job.' when 'delete' then 'Deleted job (recoverable).' else 'Archived job.' end||case when nullif(btrim(p_reason),'') is not null then E'
'||btrim(p_reason) else '' end;
 insert into public.record_notes(record_type,record_id,body,author_id,author_name,source) values(kind,p_id,note,auth.uid()::text,coalesce(actor,'Staff'),'call_dashboard');
 update public.booking_visits set archived_at=case when p_action='restore' and archive_reason='parent_archived' then null when p_action<>'restore' then coalesce(archived_at,now()) else archived_at end,archive_reason=case when p_action='restore' and archive_reason='parent_archived' then null when p_action<>'restore' and archived_at is null then 'parent_archived' else archive_reason end,history=history||jsonb_build_array(jsonb_build_object('at',now(),'by',coalesce(actor,'Staff'),'note',note,'changes',jsonb_build_object('record_action',p_action,'before',before_record,'after',after_record))),updated_at=clock_timestamp() where (p_kind='recurring_job' and recurring_job_id=p_id) or (p_kind='job' and job_id=p_id);
 return after_record;
end $$;
revoke all on function public.manage_booking_job(text,text,text,timestamptz,text) from public,anon;
grant execute on function public.manage_booking_job(text,text,text,timestamptz,text) to authenticated;

create or replace function public.sync_booking_visits() returns void language plpgsql security invoker set search_path='' as $$
declare r record; d date; cutoff date := (current_date + interval '13 months')::date; step integer; month_step integer; occurrence_index integer;
begin
 for r in select * from public.recurring_jobs where active and deleted_at is null and next_date is not null loop
  step := coalesce(r.custom_days,case r.frequency when 'weekly' then 7 when 'fortnightly' then 14 when 'monthly' then 30 when '6weekly' then 42 when 'bimonthly' then 61 when 'quarterly' then 91 when '6monthly' then 182 when 'annually' then 365 else null end);
  if step is null or step<1 then continue; end if;
  month_step:=case when coalesce(r.legacy_recurrence_rule,'') like '%FREQ=MONTHLY%' then coalesce(substring(r.legacy_recurrence_rule from 'INTERVAL=([0-9]+)')::integer,1) else null end;
  occurrence_index:=0;
  d:=r.next_date;
  while d<=cutoff loop
   insert into public.booking_visits(source_key,recurring_job_id,client_id,occurrence_date,due_month,work_type,next_contact_date)
   values ('recurring:'||r.id||':'||d,r.id,r.client_id,d,date_trunc('month',d)::date,'recurring',date_trunc('month',d)::date-14)
   on conflict(recurring_job_id,occurrence_date) do update set archived_at=null,archive_reason=null,updated_at=clock_timestamp() where booking_visits.archive_reason='schedule_replaced';
   occurrence_index:=occurrence_index+1;
   d:=case when month_step is not null then (r.next_date+make_interval(months=>month_step*occurrence_index))::date else d+step end;
  end loop;
 end loop;
 insert into public.booking_visits(source_key,recurring_job_id,client_id,work_type,setup_note)
 select 'recurring:'||id||':undated',id,client_id,'recurring','Set the next service month in the CRM.' from public.recurring_jobs where active and deleted_at is null and next_date is null on conflict do nothing;
 insert into public.booking_visits(source_key,job_id,client_id,calendar_event_id,work_type)
 select 'job:'||id,id,client_id,google_calendar_event_id,'new' from public.jobs
 where lower(status)='active' and deleted_at is null and coalesce(trim(completion_date),'')=''
 on conflict do nothing;
end $$;

create or replace function public.save_booking_visit(p_id uuid,p_changes jsonb,p_note text,p_expected_at timestamptz)
returns public.booking_visits language plpgsql security invoker set search_path='' as $$
declare v public.booking_visits; actor text;
begin
 select * into v from public.booking_visits where id=p_id for update;
 if not found or v.archived_at is not null then raise exception 'Visit archived or unavailable'; end if;
 if v.recurring_job_id is not null and not exists(select 1 from public.recurring_jobs where id=v.recurring_job_id and active and deleted_at is null and archived_at is null) then raise exception 'Recurring arrangement is archived'; end if;
 if v.job_id is not null and not exists(select 1 from public.jobs where id=v.job_id and lower(status)='active' and deleted_at is null and archived_at is null) then raise exception 'Job is archived'; end if;
 if v.booking_lock_until>now() and v.booking_lock_token::text is distinct from p_changes->>'_booking_token' then raise exception 'Another rep is confirming this booking. Try again shortly.'; end if;
 if v.updated_at is distinct from p_expected_at then raise exception 'This visit changed. Refresh before saving.'; end if;
 select display_name into actor from public.staff_profiles where auth_user_id=auth.uid();
 update public.booking_visits set
  booking_lock_token=case when p_changes ? '_booking_token' then null else booking_lock_token end,
  booking_lock_until=case when p_changes ? '_booking_token' then null else booking_lock_until end,
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
  history=history||jsonb_build_array(jsonb_build_object('at',now(),'by',coalesce(actor,'Staff'),'user_id',auth.uid(),'note',p_note,'changes',p_changes-'_booking_token')),
  updated_at=clock_timestamp()
 where id=p_id returning * into v;
 if v.status='confirmed' and v.job_id is not null then
  update public.jobs set completion_date=v.confirmed_date::text,google_calendar_event_id=v.calendar_event_id where id=v.job_id;
 end if;
 return v;
end $$;

create or replace function public.claim_booking_confirmation(p_id uuid,p_expected_at timestamptz,p_token uuid)
returns public.booking_visits language plpgsql security invoker set search_path='' as $$
declare v public.booking_visits;
begin
 update public.booking_visits set booking_lock_token=p_token,booking_lock_until=now()+interval '5 minutes',updated_at=clock_timestamp()
 where id=p_id and archived_at is null and (recurring_job_id is null or exists(select 1 from public.recurring_jobs r where r.id=recurring_job_id and r.active and r.deleted_at is null and r.archived_at is null)) and (job_id is null or exists(select 1 from public.jobs j where j.id=job_id and lower(j.status)='active' and j.deleted_at is null and j.archived_at is null)) and updated_at=p_expected_at and (booking_lock_until is null or booking_lock_until<now()) returning * into v;
 if not found then raise exception 'Booking changed or another rep is confirming it. Refresh and try again.'; end if;
 return v;
end $$;
