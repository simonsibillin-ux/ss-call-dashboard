create policy "Server-only Google Calendar connection"
on public.google_calendar_connections
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
