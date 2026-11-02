create or replace function public.sync_booking_visits() returns void language plpgsql security invoker set search_path='' as $$
declare r record; d date; cutoff date := (current_date + interval '13 months')::date; step integer; month_step integer; occurrence_index integer;
begin
 for r in select * from public.recurring_jobs where active and next_date is not null loop
  step := coalesce(r.custom_days,case r.frequency when 'weekly' then 7 when 'fortnightly' then 14 when 'monthly' then 30 when '6weekly' then 42 when 'bimonthly' then 61 when 'quarterly' then 91 when '6monthly' then 182 when 'annually' then 365 else null end);
  if step is null or step<1 then continue; end if;
  month_step:=case when coalesce(r.legacy_recurrence_rule,'') like '%FREQ=MONTHLY%' then coalesce(substring(r.legacy_recurrence_rule from 'INTERVAL=([0-9]+)')::integer,1) else null end;
  occurrence_index:=0;
  d:=r.next_date;
  while d<=cutoff loop
   insert into public.booking_visits(source_key,recurring_job_id,client_id,occurrence_date,due_month,work_type,next_contact_date)
   values ('recurring:'||r.id||':'||d,r.id,r.client_id,d,date_trunc('month',d)::date,'recurring',date_trunc('month',d)::date-14)
   on conflict do nothing;
   occurrence_index:=occurrence_index+1;
   d:=case when month_step is not null then (r.next_date+make_interval(months=>month_step*occurrence_index))::date else d+step end;
  end loop;
 end loop;
 insert into public.booking_visits(source_key,recurring_job_id,client_id,work_type,setup_note)
 select 'recurring:'||id||':undated',id,client_id,'recurring','Set the next service month in the CRM.' from public.recurring_jobs where active and next_date is null on conflict do nothing;
 insert into public.booking_visits(source_key,job_id,client_id,calendar_event_id,work_type)
 select 'job:'||id,id,client_id,google_calendar_event_id,'new' from public.jobs
 where lower(status)='active' and coalesce(trim(completion_date),'')=''
 on conflict do nothing;
end $$;

delete from public.booking_visits v using public.recurring_jobs r
where v.recurring_job_id=r.id and r.source_calendar_event_id is not null and r.legacy_recurrence_rule like '%FREQ=MONTHLY%'
and v.calendar_event_id is null and v.status='needs_booking' and v.history='[]'::jsonb;
select public.sync_booking_visits();
