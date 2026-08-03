-- Shared Call Dashboard tables.
-- Run this once in the Supabase SQL editor for the project used by js/config.js.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_todos (
  id text primary key,
  text text not null,
  done boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.app_todos enable row level security;

drop policy if exists "Dashboard settings are readable" on public.app_settings;
drop policy if exists "Dashboard settings are writable by dashboard" on public.app_settings;
drop policy if exists "Dashboard todos are readable" on public.app_todos;
drop policy if exists "Dashboard todos are writable by dashboard" on public.app_todos;

create policy "Dashboard settings are readable"
on public.app_settings for select
using (true);

create policy "Dashboard settings are writable by dashboard"
on public.app_settings for all
using (true)
with check (true);

create policy "Dashboard todos are readable"
on public.app_todos for select
using (true);

create policy "Dashboard todos are writable by dashboard"
on public.app_todos for all
using (true)
with check (true);
