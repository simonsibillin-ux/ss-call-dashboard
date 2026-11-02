create or replace function public.import_calendar_booking(p_event jsonb,p_client_id text,p_kind text,p_existing_recurring_id text,p_service text,p_frequency text,p_due_month date,p_amount numeric)
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
   update public.recurring_jobs set client_id=c.id,next_date=coalesce(next_date,original_day,p_due_month),source_calendar_event_id=coalesce(source_calendar_event_id,p_event->>'id'),source_calendar_series_id=coalesce(source_calendar_series_id,p_event->>'recurringEventId') where id=rid;
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
  select id into vid from public.booking_visits where recurring_job_id=rid and (due_month=p_due_month or occurrence_date is null) order by occurrence_date nulls last limit 1;
 end if;
 if vid is not null then
  update public.booking_visits set calendar_event_id=p_event->>'id',client_id=c.id,due_month=p_due_month,occurrence_date=coalesce(occurrence_date,original_day,p_due_month),setup_note='Imported calendar record. Scope and pricing require review.' where id=vid;
 else
  insert into public.booking_visits(source_key,recurring_job_id,job_id,client_id,calendar_event_id,occurrence_date,due_month,work_type,setup_note)
  values(case when rid is not null then 'recurring:'||rid||':'||original_day else 'job:'||jid end,rid,jid,c.id,p_event->>'id',original_day,p_due_month,
  case when rid is not null then 'recurring' else 'new' end,'Imported calendar record. Scope and pricing require review.') returning id into vid;
 end if;
 return vid;
end $$;
revoke all on function public.import_calendar_booking(jsonb,text,text,text,text,text,date,numeric) from public,anon;
grant execute on function public.import_calendar_booking(jsonb,text,text,text,text,text,date,numeric) to authenticated;
