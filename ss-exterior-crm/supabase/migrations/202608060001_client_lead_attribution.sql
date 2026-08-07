-- Persist campaign attribution on the client so jobs, quotes and invoices can be
-- traced back through the client relationship and its linked Marketing Hub lead.
alter table if exists public.clients
  add column if not exists campaign_name text,
  add column if not exists campaign_id text;

create index if not exists clients_campaign_id_idx on public.clients(campaign_id);
