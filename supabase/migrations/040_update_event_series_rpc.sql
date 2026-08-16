-- 040_update_event_series_rpc.sql
--
-- updateEvent(updateFuture: true) looped over every future event in a
-- recurrence group issuing one unchecked UPDATE per row:
--
--   for (const fe of futureEvents) {
--     await supabase.from('events').update({...}).eq('id', fe.id)   // no error check
--   }
--
-- Four problems, all fixed by doing the whole thing in one statement.
--
-- 1. NOT ATOMIC. A failure partway through left the series half-moved — some
--    sessions at the new time, some at the old — and the action still returned
--    success. For a season-long weekly series that is a schedule nobody can
--    trust, and no error anywhere to explain it.
--
-- 2. SILENT SKIP THEN NOTIFY. The loop was wrapped in `if (futureEvents)`. That
--    fetch is unchecked, so if it failed the loop was skipped entirely and the
--    code carried straight on to notifyTeamMembers(), pushing
--    "Schedule updated: ... (this and future events)" to every parent on the
--    team. Nothing had changed. This is the worst of the four: it actively
--    misinforms families about where to be.
--
-- 3. N ROUND TRIPS. A 20-week series meant 20 sequential awaits.
--
-- 4. DURATION CHANGES WERE SILENTLY DISCARDED. The loop applied only a start
--    offset (feEnd = fe.end_time + offsetMs), so editing a practice from
--    4-5pm to 4-6pm and choosing "this and future" produced offset = 0 and
--    every event kept its old one-hour length — including the event actually
--    being edited. The change simply vanished with no error.
--    This function sets each event's duration to the new duration instead.
--
-- SECURITY INVOKER (the plpgsql default, stated explicitly here because it is
-- load-bearing) — this must NOT be SECURITY DEFINER. Running as the caller
-- keeps events_doc_all / events_coach_all in force, so a coach editing a
-- series outside their remit updates 0 rows rather than bypassing RLS. The
-- returned row count is what the caller checks to tell the difference.
--
-- Both reads and the write are inside one function call, so the whole
-- operation is a single implicit transaction: all rows move or none do.
--
-- start_time >= v_orig_start preserves the original .gte() semantics: "this
-- and future", not the whole series. Rows earlier in the group are untouched.

create or replace function public.update_event_series(
  p_event_id   uuid,
  p_title      text,
  p_start_time timestamptz,
  p_end_time   timestamptz,
  p_venue_id   uuid,
  p_address    text,
  p_link       text,
  p_notes      text
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_group      uuid;
  v_orig_start timestamptz;
  v_offset     interval;
  v_duration   interval;
  v_count      integer;
begin
  select recurrence_group, start_time
    into v_group, v_orig_start
    from events
   where id = p_event_id;

  if not found then
    raise exception 'Event not found, or you do not have access to it';
  end if;

  if v_group is null then
    raise exception 'Event is not part of a recurring series';
  end if;

  v_offset   := p_start_time - v_orig_start;
  v_duration := p_end_time - p_start_time;

  update events
     set title      = p_title,
         -- right-hand start_time is the pre-update value, so end_time is
         -- derived from the old start plus the shift, then given the new length
         start_time = start_time + v_offset,
         end_time   = start_time + v_offset + v_duration,
         venue_id   = p_venue_id,
         address    = p_address,
         link       = p_link,
         notes      = p_notes
   where recurrence_group = v_group
     and start_time >= v_orig_start;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.update_event_series(uuid, text, timestamptz, timestamptz, uuid, text, text, text) from public, anon;
grant  execute on function public.update_event_series(uuid, text, timestamptz, timestamptz, uuid, text, text, text) to authenticated;
