create or replace function public.edit_booking_job(p_visit_id uuid,p_scope text,p_changes jsonb,p_expected_visit_at timestamptz,p_expected_record_at timestamptz,p_reason text)
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
  if p_scope is null or p_scope not in ('visit','future') then raise exception 'Choose this visit or the recurring arrangement'; end if;
  before_record:=to_jsonb(r); record_type:='recurring_job';record_id:=r.id;
 else
  select * into j from public.jobs where id=v.job_id for update;
  if not found or lower(j.status)<>'active' or j.deleted_at is not null then raise exception 'Active job unavailable'; end if;
  if j.updated_at is distinct from p_expected_record_at then raise exception 'This job changed. Refresh before saving.'; end if;
  if p_scope is null or p_scope<>'job' then raise exception 'Choose the job scope'; end if;
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
 if coalesce((p_changes->>'hours')::numeric,0)<0 or coalesce((p_changes->>'hours')::numeric,0)>100000 then raise exception 'Hours cannot be negative'; end if;
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
  if plan_changed and exists(select 1 from public.booking_visits where recurring_job_id=r.id and id<>v.id and archived_at is null and service_override is not null and status<>'confirmed' and coalesce(occurrence_date,current_date)>=coalesce(v.occurrence_date,current_date)) then raise exception 'Future visits have individual service changes. Review those visits before changing the recurrence schedule.'; end if;
  if plan_changed and v.status='confirmed' then raise exception 'Change the recurrence from an unconfirmed visit. This visit already has an agreed date.'; end if;
  if plan_changed and exists(select 1 from public.booking_visits where recurring_job_id=r.id and id<>v.id and status='confirmed' and coalesce(occurrence_date,confirmed_date)>=coalesce(v.occurrence_date,current_date) and archived_at is null) then raise exception 'Future visits are already confirmed. Review those dates before changing the recurrence schedule.'; end if;
  -- Preserve agreed services on other confirmed visits and work preceding this visit.
  update public.booking_visits set service_override=old_service,updated_at=clock_timestamp()
   where recurring_job_id=r.id and id<>v.id and service_override is null and (status='confirmed' or occurrence_date<coalesce(v.occurrence_date,r.next_date,current_date));
  update public.recurring_jobs set calendar_service_aliases=case when service is distinct from service_data->>'service' and nullif(service,'') is not null then array(select distinct value from unnest(calendar_service_aliases||array[service]) value) else calendar_service_aliases end,service=service_data->>'service',description=service_data->>'description',items=normalized,revenue=total,hours=(service_data->>'hours')::numeric,frequency=edit_frequency,custom_days=edit_custom_days,next_date=next_day,
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

