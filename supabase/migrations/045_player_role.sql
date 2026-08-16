-- 045_player_role.sql
--
-- Adds a 'player' role so squad members can hold accounts of their own.
--
-- Until now the only roles were doc / coach / parent, enforced by three CHECK
-- constraints. A college squad has no parents at all, so an FAU player could
-- only exist as a login-less roster record, or be labelled somebody's parent.
--
-- WHAT A PLAYER OWNS
--
-- A player account owns its own players row through players.parent_id. That
-- column has never really meant "the parent" — it means "the auth user who
-- owns this player record", which for a youth club is a parent and for a
-- college squad is the athlete themselves.
--
-- Reusing it is the whole reason this migration is small. ELEVEN existing
-- policies are written as `parent_id = auth.uid()`:
--
--   players_parent_own          attendance_parent_read
--   attendance_parent_insert    attendance_parent_update
--   rsvps_parent_all            feedback_parent_read
--   camp_reg_parent_insert      ... and the rsvp/share/digest set in 032
--
-- Every one of them keeps working for a player with no change, because the
-- player's own user id is simply what sits in that column. The alternative,
-- a separate players.user_id, would have meant duplicating all eleven.
--
-- The cost is a column whose name now under-describes it. That is recorded in
-- the comment below rather than fixed here, because renaming it would touch
-- every policy, query and type in the app and this is not the moment.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
-- No new policies are added. A player sees their own row, their team's events
-- (events_member_read is team-scoped, not role-scoped), and their own
-- attendance/RSVP/feedback — all through the parent policies above. If a
-- player should ever see LESS than a parent does, that is a new policy and a
-- deliberate decision, not an oversight here.

-- 1. profiles.role
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('doc', 'coach', 'parent', 'player'));

-- 2. invites.role — a player can now be invited, by link or by team code
alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role in ('coach', 'parent', 'player'));

-- 3. team_members.role
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('coach', 'parent', 'player'));

comment on column public.players.parent_id is
  'The auth user who OWNS this player record: a parent at a youth club, or the athlete themselves at a college program where players hold their own accounts. Nullable since 044. Named parent_id for historical reasons - eleven RLS policies are written against it as parent_id = auth.uid(), which is what makes the player role work without duplicating them.';
