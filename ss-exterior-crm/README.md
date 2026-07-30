# SS Exterior Services CRM

This CRM is a Vercel-hosted React/Vite app backed by Supabase tables and local source files in this repository.

## Architecture

- `src/` contains the local React CRM screens, shared context, UI helpers, and client-linking logic.
- `api/` contains Vercel serverless API routes for AI chat, portal actions, SMS, Google Calendar, Meta leads, and automation jobs.
- Supabase stores the CRM data: clients, jobs, quotes, invoices, receipts, bookings, messages, documents, and finance records.
- `supabase/migrations/` contains database migration SQL that should be applied in Supabase when the data model changes.

## Client-Centred Data Model

Clients are the central record. Operational tables keep their existing client name fields for display and backwards compatibility, but should also carry `client_id` so jobs, quotes, invoices, receipts, recurring work, messages, bookings, documents, and credits are connected to the correct client record even when names are duplicated.

Apply `supabase/migrations/202607300001_client_id_links.sql` in Supabase to add and backfill those `client_id` columns.

## Local Development

```bash
npm install
npm run dev
```

## Production Check

```bash
npm run build
```
