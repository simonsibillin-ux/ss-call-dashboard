alter table public.quotes
  add column if not exists created_by_rep_id text,
  add column if not exists created_by_rep_name text,
  add column if not exists accepted_by_rep_id text,
  add column if not exists accepted_by_rep_name text,
  add column if not exists accepted_at timestamptz;

alter table public.jobs
  add column if not exists booked_by_rep_id text,
  add column if not exists booked_by_rep_name text,
  add column if not exists booked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_created_by_rep_id_fkey') then
    alter table public.quotes add constraint quotes_created_by_rep_id_fkey
      foreign key (created_by_rep_id) references public.call_reps(id)
      on update cascade on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quotes_accepted_by_rep_id_fkey') then
    alter table public.quotes add constraint quotes_accepted_by_rep_id_fkey
      foreign key (accepted_by_rep_id) references public.call_reps(id)
      on update cascade on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_booked_by_rep_id_fkey') then
    alter table public.jobs add constraint jobs_booked_by_rep_id_fkey
      foreign key (booked_by_rep_id) references public.call_reps(id)
      on update cascade on delete set null;
  end if;
end $$;

create index if not exists quotes_created_by_rep_id_idx on public.quotes(created_by_rep_id);
create index if not exists quotes_accepted_by_rep_id_idx on public.quotes(accepted_by_rep_id);
create index if not exists jobs_booked_by_rep_id_idx on public.jobs(booked_by_rep_id);

comment on column public.quotes.created_by_rep_id is 'Call rep who originally created the quote; nullable for CRM, portal, automation, and legacy records.';
comment on column public.quotes.created_by_rep_name is 'Snapshot of the quote creator display name or source.';
comment on column public.quotes.accepted_by_rep_id is 'Call rep who recorded quote acceptance; independent from quote creator.';
comment on column public.quotes.accepted_by_rep_name is 'Snapshot of the accepting rep display name or source.';
comment on column public.quotes.accepted_at is 'When quote acceptance was recorded.';
comment on column public.jobs.booked_by_rep_id is 'Call rep who converted or booked the job; nullable for CRM, portal, automation, and legacy records.';
comment on column public.jobs.booked_by_rep_name is 'Snapshot of the booking rep display name or source.';
comment on column public.jobs.booked_at is 'When the job booking was recorded.';
