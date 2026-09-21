-- Keep a durable two-way link between CRM jobs and their Google Calendar events.
alter table if exists public.jobs
  add column if not exists google_calendar_event_id text;

create unique index if not exists jobs_google_calendar_event_id_idx
  on public.jobs (google_calendar_event_id)
  where google_calendar_event_id is not null;
