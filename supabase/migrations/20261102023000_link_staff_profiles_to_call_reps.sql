alter table public.staff_profiles
  add column if not exists call_rep_id text;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_call_rep_id_fkey;

alter table public.staff_profiles
  add constraint staff_profiles_call_rep_id_fkey
  foreign key (call_rep_id) references public.call_reps(id)
  on update cascade on delete restrict;

create unique index if not exists staff_profiles_call_rep_id_key
  on public.staff_profiles (call_rep_id)
  where call_rep_id is not null;

update public.staff_profiles
set call_rep_id = 'REP-1784019699340',
    updated_at = now()
where lower(email) = 'sibcos@bigpond.com'
  and call_rep_id is distinct from 'REP-1784019699340';

