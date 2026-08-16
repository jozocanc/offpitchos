-- 042_team_members_roster_read.sql
--
-- Companion to 041. Same shape: a read policy narrow enough that the UI
-- renders an incomplete roster with no error anywhere.
--
-- team_members had three policies:
--   team_members_doc_all       ALL     team_id IN get_doc_team_ids()
--   team_members_invite_insert INSERT  (the 029/031 invite-accept path)
--   team_members_own_read      SELECT  profile_id IN get_user_profile_ids()
--
-- So the only SELECT available to a non-DOC returns the caller's OWN
-- membership rows. A coach cannot see who else is on the team he coaches.
--
-- Measured in production as coach Carlos Mendoza on his own team:
--   team_members rows visible   1
--   members actually on team    8
--
-- app/dashboard/teams/[id]/page.tsx:82 builds the roster from a user-scoped
-- read of exactly this table, joined to profiles, so the team page renders
-- the coach and nobody else. Same for coverage/actions.ts:347,
-- schedule/actions.ts:604, coach-attention-actions.ts:106 and the tactics
-- roster checks.
--
-- Note the notification paths are NOT affected and were checked: both
-- notifyTeamMembers (schedule/actions.ts:82) and the coverage parent fan-out
-- (coverage/actions.ts:290) use the service-role client, which bypasses RLS.
-- Those were never broken, which is exactly why this stayed invisible — the
-- right people got notified while the screen showed an empty roster.
--
-- Two audiences need this read, so the policy has two arms:
--
--   1. team_id IN get_user_team_ids()   — you can see who else is on a team
--      you belong to. This is the coach's own roster, and the parent seeing
--      their child's team.
--
--   2. club staff via get_staff_club_ids() — a doc/coach may read membership
--      for any team in their club. Coverage necessarily crosses teams: the
--      point is finding a coach from elsewhere in the club to cover a
--      session, which arm 1 alone would not permit.
--
-- Parents get only arm 1, so a parent still cannot enumerate teams their
-- child is not on.
--
-- get_user_team_ids() and get_staff_club_ids() are both SECURITY DEFINER, so
-- this policy on team_members reading team_members via get_user_team_ids()
-- is not recursive.
--
-- team_members carries no personal data itself (team_id, profile_id, role);
-- the names come from profiles, which 041 scoped to the caller's own club.

create policy team_members_roster_read on public.team_members
  for select
  using (
    team_id in (select public.get_user_team_ids())
    or team_id in (
      select t.id from public.teams t
      where t.club_id in (select public.get_staff_club_ids())
    )
  );
