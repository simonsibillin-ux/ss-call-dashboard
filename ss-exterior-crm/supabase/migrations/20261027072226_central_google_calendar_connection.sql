create table if not exists public.google_calendar_connections (
  id text primary key default 'company' check (id = 'company'),
  calendar_id text not null default 'primary',
  refresh_token text not null,
  connected_email text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;

revoke all on table public.google_calendar_connections from anon, authenticated;

comment on table public.google_calendar_connections is
  'Server-only Google Calendar OAuth connection. Never expose this table or its refresh token through browser clients.';
