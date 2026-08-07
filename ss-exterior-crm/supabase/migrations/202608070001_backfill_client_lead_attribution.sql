-- Backfill client profiles from their most recent linked Marketing Hub lead.
-- The UI also reads the linked booking directly, so future lead edits stay visible.
alter table if exists public.clients
  add column if not exists campaign_name text,
  add column if not exists campaign_id text;

-- Link older leads that pre-date client_id, but only where the client name is unique.
update public.bookings as booking
set client_id = matched.id
from (
  select lower(trim(name)) as name_key, min(id) as id
  from public.clients
  group by lower(trim(name))
  having count(*) = 1
) as matched
where booking.client_id is null
  and lower(trim(booking.client_name)) = matched.name_key;

with latest_attribution as (
  select distinct on (client_id)
    client_id,
    ad_source,
    campaign_name,
    campaign_id
  from public.bookings
  where client_id is not null
    and ad_source is not null
  order by client_id, created_at desc
)
update public.clients as client
set
  source = case latest.ad_source
    when 'Meta Ads' then 'Meta Ads'
    when 'Google Ads' then 'Google Ads'
    when 'Referral' then 'Referral'
    else latest.ad_source
  end,
  campaign_name = latest.campaign_name,
  campaign_id = latest.campaign_id
from latest_attribution as latest
where client.id = latest.client_id;
