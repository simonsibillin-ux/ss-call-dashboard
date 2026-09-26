-- Owner-handled records leave the customer-service queue while remaining visible
-- in a dedicated owner queue.
alter table public.record_notes
  drop constraint if exists record_notes_outcome_code_check,
  add constraint record_notes_outcome_code_check check (
    outcome_code is null or outcome_code in (
      'voicemail_left', 'sms_sent', 'email_sent', 'no_answer',
      'spoke_thinking', 'ready_to_book', 'call_on_date',
      'customer_will_contact', 'owner_handling', 'declined', 'do_not_contact'
    )
  );
