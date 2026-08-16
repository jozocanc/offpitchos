-- 038_events_staff_scope.sql
--
-- The same role-blind bug as migrations 034 and 036, on the most destructive
-- table yet. This one permits writes, not just reads.
--
-- events_coach_all was:
--   FOR ALL USING      (team_id IN (SELECT get_user_team_ids())
--                       AND NOT (club_id IN (SELECT get_doc_club_ids())))
--       WITH CHECK     (same)
--
-- get_user_team_ids() is every team_members row for the caller, with no role
-- filter at all:
--
--   SELECT tm.team_id FROM team_members tm
--   INNER JOIN profiles p ON tm.profile_id = p.id
--   WHERE p.user_id = auth.uid();
--
-- Accepting a parent invite creates exactly such a row, so despite the
-- "_coach_" name every rostered parent matched. The NOT get_doc_club_ids()
-- clause does not save it either: that subquery is empty for a parent, so
-- `club_id IN (empty)` is false and NOT false is TRUE. The guard only ever
-- excluded the club's owner.
--
-- Because the policy is FOR ALL, this granted parents INSERT, UPDATE and
-- DELETE on every event of their child's team. Not reachable through the UI,
-- but reachable through PostgREST with the parent's own JWT.
--
-- Verified against production as parent Sofia Rodriguez (role='parent',
-- rostered to U10 Boys), both probes inside a rolled-back transaction:
--
--   UPDATE a team event (title = title, no data change)  1 row   ALLOWED
--   DELETE every event on the team                       8 rows  ALLOWED
--
-- Eight events, i.e. the team's entire schedule, deletable by a parent.
-- Confirmed intact afterwards: 8 events still present, title unchanged.
--
-- The fix adds the staff requirement that the policy name always implied.
-- get_staff_club_ids() is the role-aware helper added in 034
-- (role IN ('doc','coach'), search_path pinned).
--
-- Both conditions are still required. Team membership alone is what leaked;
-- club staff alone would let a coach edit a team they have nothing to do with.
--
-- The NOT get_doc_club_ids() clause is dropped as redundant. It partitioned
-- this policy away from events_doc_all, but RLS policies are OR'd, so a DOC
-- matching both is a no-op. Keeping it would now be actively wrong: it would
-- exclude a DOC from the staff policy for no reason.
--
-- Parents keep reading their team's schedule through events_member_read,
-- which is FOR SELECT on the same get_user_team_ids() and is untouched.

drop policy if exists events_coach_all on public.events;

create policy events_coach_all on public.events
  for all
  using (
    team_id in (select public.get_user_team_ids())
    and club_id in (select public.get_staff_club_ids())
  )
  with check (
    team_id in (select public.get_user_team_ids())
    and club_id in (select public.get_staff_club_ids())
  );
