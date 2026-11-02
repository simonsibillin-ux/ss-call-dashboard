-- Preserve document notes as ordinary, undated historical internal notes.
alter table public.record_notes add column is_historical boolean not null default false;
alter table public.record_notes add column migration_key text unique;
alter table public.record_notes add column booking_visit_id uuid references public.booking_visits(id) on delete restrict;
alter table public.record_notes drop constraint record_notes_record_type_check;
alter table public.record_notes add constraint record_notes_record_type_check check (record_type in ('quote','job','invoice','calendar_event','lead','recurring_job'));
alter table public.record_notes drop constraint record_notes_outcome_code_check;
alter table public.record_notes add constraint record_notes_outcome_code_check check (outcome_code is null or outcome_code in ('voicemail_left','sms_sent','email_sent','messenger_sent','no_answer','spoke_thinking','ready_to_book','call_on_date','customer_will_contact','owner_handling','declined','do_not_contact','skipped','deferred'));
create index record_notes_booking_visit_idx on public.record_notes(booking_visit_id) where booking_visit_id is not null;

create function public.archive_legacy_internal_note(p_type text,p_id text,p_text text) returns void
language plpgsql security invoker set search_path='' as $$
declare start_marker constant text:='--- SS CALL DASHBOARD HISTORY ---'; end_marker constant text:='--- END SS CALL DASHBOARD HISTORY ---';
 start_pos integer; end_pos integer; prefix text; projection text; piece text; pieces text[];
begin
 if nullif(btrim(p_text),'') is null then return; end if;
 start_pos:=strpos(p_text,start_marker);
 if start_pos=0 then pieces:=array[btrim(p_text)];
 else
  end_pos:=strpos(p_text,end_marker);
  prefix:=btrim(substring(p_text from 1 for start_pos-1));
  if end_pos>start_pos then
   prefix:=btrim(prefix||E'\n\n'||substring(p_text from end_pos+length(end_marker)));
   projection:=substring(p_text from start_pos+length(start_marker) for end_pos-start_pos-length(start_marker));
  else projection:=substring(p_text from start_pos+length(start_marker)); end if;
  pieces:=array[prefix]||regexp_split_to_array(projection,E'\n?\\[[^\n]+\\][ \t]*\n');
 end if;
 foreach piece in array pieces loop
  piece:=btrim(piece);
  if piece='' then continue; end if;
  if exists(select 1 from public.record_notes where record_type=p_type and record_id=p_id and btrim(body)=piece) then continue; end if;
  insert into public.record_notes(record_type,record_id,body,author_name,source,is_historical,migration_key)
  values(p_type,p_id,piece,'Historical note','legacy_import',true,'legacy:'||p_type||':'||p_id||':'||md5(piece)) on conflict(migration_key) do nothing;
 end loop;
end $$;
revoke all on function public.archive_legacy_internal_note(text,text,text) from public,anon;
grant execute on function public.archive_legacy_internal_note(text,text,text) to authenticated,service_role;

create function public.capture_document_internal_notes() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.archive_legacy_internal_note(TG_ARGV[0],new.id::text,new.notes);
 return new;
end $$;
revoke all on function public.capture_document_internal_notes() from public,anon;
grant execute on function public.capture_document_internal_notes() to authenticated,service_role;
create trigger quotes_internal_note_archive after insert or update of notes on public.quotes for each row execute function public.capture_document_internal_notes('quote');
create trigger jobs_internal_note_archive after insert or update of notes on public.jobs for each row execute function public.capture_document_internal_notes('job');
create trigger recurring_internal_note_archive after insert or update of notes on public.recurring_jobs for each row execute function public.capture_document_internal_notes('recurring_job');
create trigger invoices_internal_note_archive after insert or update of notes on public.invoices for each row execute function public.capture_document_internal_notes('invoice');

do $$ declare r record; begin
 for r in select 'quote' as type,id::text,notes from public.quotes union all select 'job',id::text,notes from public.jobs union all select 'recurring_job',id::text,notes from public.recurring_jobs union all select 'invoice',id::text,notes from public.invoices loop
  perform public.archive_legacy_internal_note(r.type,r.id,r.notes);
 end loop;
end $$;

-- Unify the existing booking action history with record_notes, without copying administrative priority changes.
create function public.capture_booking_contact_notes() returns trigger language plpgsql security invoker set search_path='' as $$
declare entry jsonb; ordinal bigint; note_type text; note_id text; code text;
begin
 note_type:=case when new.recurring_job_id is not null then 'recurring_job' when new.job_id is not null then 'job' else 'calendar_event' end;
 note_id:=coalesce(new.recurring_job_id,new.job_id,new.calendar_event_id);
 if note_id is null then return new; end if;
 for entry,ordinal in select value,ordinality from jsonb_array_elements(new.history) with ordinality loop
  if not ((entry->'changes') ? 'last_outcome' or entry->'changes'->>'status'='confirmed') then continue; end if;
  code:=entry->'changes'->>'last_outcome';
  insert into public.record_notes(record_type,record_id,body,author_id,author_name,source,created_at,updated_at,outcome_code,next_contact_date,action_result,booking_visit_id,migration_key)
  values(note_type,note_id,entry->>'note',entry->>'user_id',coalesce(entry->>'by','Staff'),'call_dashboard',coalesce((entry->>'at')::timestamptz,now()),coalesce((entry->>'at')::timestamptz,now()),code,
  (entry->'changes'->>'next_contact_date')::date,case when code in ('declined','do_not_contact','skipped') then 'suppressed' when entry->'changes'->>'status' in ('confirmed','ready_to_book') then 'completed' else 'deferred' end,new.id,'booking:'||new.id||':'||ordinal)
  on conflict(migration_key) do nothing;
 end loop;
 return new;
end $$;
revoke all on function public.capture_booking_contact_notes() from public,anon;
grant execute on function public.capture_booking_contact_notes() to authenticated,service_role;
create trigger booking_contact_internal_notes after update of history on public.booking_visits for each row execute function public.capture_booking_contact_notes();
update public.booking_visits set history=history where jsonb_array_length(history)>0;

create function public.archive_calendar_internal_notes(p_events jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare e jsonb;
begin
 if (select app_private.current_staff_role()) is null or (select app_private.current_staff_role()) not in ('admin','customer_service') then raise exception 'Staff access required'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if nullif(e->>'id','') is not null then perform public.archive_legacy_internal_note('calendar_event',e->>'id',e->>'description'); end if;
 end loop;
end $$;
revoke all on function public.archive_calendar_internal_notes(jsonb) from public,anon;
grant execute on function public.archive_calendar_internal_notes(jsonb) to authenticated;
