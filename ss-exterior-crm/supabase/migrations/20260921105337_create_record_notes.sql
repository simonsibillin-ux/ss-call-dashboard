-- Timestamped activity entries are the source of truth for quote/job follow-up history.
-- The apps continue projecting these entries into the legacy notes text columns so
-- existing CRM and Google Calendar workflows remain backwards compatible.
create table if not exists public.record_notes (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('quote', 'job', 'calendar_event')),
  record_id text not null,
  body text not null check (length(trim(body)) > 0),
  author_id text,
  author_name text not null default 'Unknown rep',
  source text not null default 'call_dashboard' check (source in ('call_dashboard', 'crm', 'google_calendar', 'legacy_import')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone
);

create index if not exists record_notes_active_record_timeline_idx
  on public.record_notes (record_type, record_id, created_at desc)
  where deleted_at is null;

alter table public.record_notes enable row level security;

-- The existing call dashboard uses the project's public anon role plus an in-app
-- rep PIN. Match that access model, but intentionally omit DELETE: entries are
-- soft-deleted so accidental removals remain recoverable.
grant select, insert, update on table public.record_notes to anon, authenticated;

create policy "record_notes_read"
  on public.record_notes for select
  to anon, authenticated
  using (true);

create policy "record_notes_create"
  on public.record_notes for insert
  to anon, authenticated
  with check (true);

create policy "record_notes_update"
  on public.record_notes for update
  to anon, authenticated
  using (true)
  with check (true);
