alter table if exists public.client_credits
  add column if not exists total_reserved numeric not null default 0;

update public.client_credits
set total_reserved = 0
where total_reserved is null;
