-- Store the mandatory reason supplied when a quote is rejected in either app.
alter table if exists public.quotes
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamp with time zone;
