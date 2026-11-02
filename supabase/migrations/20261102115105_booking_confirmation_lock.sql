alter table public.booking_visits add column booking_lock_token uuid, add column booking_lock_until timestamptz;
create function public.claim_booking_confirmation(p_id uuid,p_expected_at timestamptz,p_token uuid)
returns public.booking_visits language plpgsql security invoker set search_path='' as $$
declare v public.booking_visits;
begin
 update public.booking_visits set booking_lock_token=p_token,booking_lock_until=now()+interval '5 minutes',updated_at=clock_timestamp()
 where id=p_id and updated_at=p_expected_at and (booking_lock_until is null or booking_lock_until<now()) returning * into v;
 if not found then raise exception 'Booking changed or another rep is confirming it. Refresh and try again.'; end if;
 return v;
end $$;
create function public.release_booking_confirmation(p_id uuid,p_token uuid) returns void
language sql security invoker set search_path='' as $$
 update public.booking_visits set booking_lock_token=null,booking_lock_until=null where id=p_id and booking_lock_token=p_token;
$$;
revoke all on function public.claim_booking_confirmation(uuid,timestamptz,uuid) from public,anon;
revoke all on function public.release_booking_confirmation(uuid,uuid) from public,anon;
grant execute on function public.claim_booking_confirmation(uuid,timestamptz,uuid) to authenticated;
grant execute on function public.release_booking_confirmation(uuid,uuid) to authenticated;
create or replace function public.save_booking_visit(p_id uuid,p_changes jsonb,p_note text,p_expected_at timestamptz)
returns public.booking_visits language plpgsql security invoker set search_path='' as $$
declare v public.booking_visits; actor text;
begin
 select * into v from public.booking_visits where id=p_id for update;
 if not found then raise exception 'Visit unavailable'; end if;
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
