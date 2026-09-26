-- Structured outcomes make follow-up timing deterministic while retaining the
-- free-text note for context. Existing note rows remain valid.
alter table public.record_notes
  add column if not exists outcome_code text,
  add column if not exists next_contact_date date,
  add column if not exists action_result text;

alter table public.record_notes
  drop constraint if exists record_notes_outcome_code_check,
  add constraint record_notes_outcome_code_check check (
    outcome_code is null or outcome_code in (
      'voicemail_left', 'sms_sent', 'email_sent', 'no_answer',
      'spoke_thinking', 'ready_to_book', 'call_on_date',
      'customer_will_contact', 'owner_handling', 'declined', 'do_not_contact'
    )
  ),
  drop constraint if exists record_notes_action_result_check,
  add constraint record_notes_action_result_check check (
    action_result is null or action_result in ('completed', 'deferred', 'suppressed')
  ),
  drop constraint if exists record_notes_call_on_date_requires_date_check,
  add constraint record_notes_call_on_date_requires_date_check check (
    outcome_code is distinct from 'call_on_date' or next_contact_date is not null
  );

create index if not exists record_notes_follow_up_outcome_idx
  on public.record_notes (record_type, record_id, outcome_code, created_at desc)
  where deleted_at is null and outcome_code is not null;

comment on column public.record_notes.outcome_code is 'Structured customer-service outcome used by follow-up timing rules.';
comment on column public.record_notes.next_contact_date is 'Rep-selected override date for the next customer contact.';
comment on column public.record_notes.action_result is 'Measurement category: completed, deferred, or suppressed.';
