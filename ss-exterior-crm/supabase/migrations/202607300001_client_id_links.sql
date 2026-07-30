-- Make the CRM client-centred without deleting the existing name fields.
-- Existing text fields stay in place as display snapshots and for backwards compatibility.

alter table if exists public.jobs
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

alter table if exists public.quotes
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

alter table if exists public.invoices
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

alter table if exists public.recurring_jobs
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

alter table if exists public.messages
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

alter table if exists public.bookings
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

alter table if exists public.client_documents
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

alter table if exists public.client_credits
  add column if not exists client_id text references public.clients(id) on update cascade on delete set null;

update public.jobs r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client)) = c.name_key;

update public.quotes r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client)) = c.name_key;

update public.invoices r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client)) = c.name_key;

update public.recurring_jobs r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client)) = c.name_key;

update public.messages r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client_name)) = c.name_key;

update public.bookings r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client_name)) = c.name_key;

update public.client_documents r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client_name)) = c.name_key;

update public.client_credits r
set client_id = c.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) c
where r.client_id is null
  and lower(trim(r.client_name)) = c.name_key;

create index if not exists jobs_client_id_idx on public.jobs(client_id);
create index if not exists quotes_client_id_idx on public.quotes(client_id);
create index if not exists invoices_client_id_idx on public.invoices(client_id);
create index if not exists recurring_jobs_client_id_idx on public.recurring_jobs(client_id);
create index if not exists messages_client_id_idx on public.messages(client_id);
create index if not exists bookings_client_id_idx on public.bookings(client_id);
create index if not exists client_documents_client_id_idx on public.client_documents(client_id);
create index if not exists client_credits_client_id_idx on public.client_credits(client_id);
