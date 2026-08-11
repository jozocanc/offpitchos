-- 036_rsvp_staff_read_scope.sql
--
-- Same role-blind bug as migration 034, on a table that leaks more.
--
-- rsvps_staff_read was:
--   FOR SELECT USING (event_id IN (SELECT e.id FROM events e
--                     WHERE e.club_id IN (SELECT get_user_club_ids())))
--
-- get_user_club_ids() is any club member, parents included, so despite the
-- "_staff_" name every parent could read every RSVP in the club. Verified
-- against production: a parent saw 2 of 2 RSVPs on an event, including another
-- family's.
--
-- event_rsvps carries a free-text `reason` column, which is where a parent
-- types why their child is missing ("injured", "family funeral"). So this
-- exposed other families' stated reasons, not merely a yes/no count.
--
-- Parents keep full access to their own children through rsvps_parent_all
-- (player_id IN players WHERE parent_id = auth.uid()), which is untouched.
--
-- Safe for the UI: the aggregate tally is rendered only when canEdit is true
-- (schedule-client.tsx:97 and :282, canEdit = DOC or COACH). Parents never see
-- it. getRsvpTalliesForEvents() runs for every role on the schedule page, but
-- for a parent its result is simply not rendered, and RLS filtering rows
-- returns fewer rows rather than erroring.

drop policy if exists rsvps_staff_read on public.event_rsvps;

create policy rsvps_staff_read on public.event_rsvps
  for select
  using (
    event_id in (
      select e.id from public.events e
      where e.club_id in (select public.get_staff_club_ids())
    )
  );
