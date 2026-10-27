with candidates as (
  select distinct on (n.record_id) n.record_id,n.author_id,n.author_name
  from public.record_notes n join public.call_reps r on r.id=n.author_id
  where n.record_type='quote' and n.deleted_at is null
    and (n.body ~* 'Phone quote via Call Dashboard' or n.body ~* 'RepID:')
  order by n.record_id,n.created_at asc
)
update public.quotes q set created_by_rep_id=c.author_id,created_by_rep_name=c.author_name
from candidates c where q.id=c.record_id and q.created_by_rep_id is null;

with candidates as (
  select distinct on (n.record_id) n.record_id,n.author_id,n.author_name,n.created_at
  from public.record_notes n join public.call_reps r on r.id=n.author_id
  where n.record_type='quote' and n.deleted_at is null and n.body ~* 'Accepted.*Call Dashboard'
  order by n.record_id,n.created_at asc
)
update public.quotes q set accepted_by_rep_id=c.author_id,accepted_by_rep_name=c.author_name,accepted_at=c.created_at
from candidates c where q.id=c.record_id and q.accepted_by_rep_id is null;

update public.jobs j set booked_by_rep_id=q.accepted_by_rep_id,booked_by_rep_name=q.accepted_by_rep_name,booked_at=coalesce(q.accepted_at,j.created_at at time zone 'Australia/Melbourne')
from public.quotes q where j.quote_id=q.id and j.booked_by_rep_id is null and q.accepted_by_rep_id is not null;

with candidates as (
  select distinct on (n.record_id) n.record_id,n.author_id,n.author_name,n.created_at
  from public.record_notes n join public.call_reps r on r.id=n.author_id
  where n.record_type='job' and n.deleted_at is null and n.body ~* 'Booked via Call Dashboard'
  order by n.record_id,n.created_at asc
)
update public.jobs j set booked_by_rep_id=c.author_id,booked_by_rep_name=c.author_name,booked_at=c.created_at
from candidates c where j.id=c.record_id and j.booked_by_rep_id is null;
