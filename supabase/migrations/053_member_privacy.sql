-- 053_member_privacy.sql
--
-- Players hold their own accounts now (team-only product, 2026-09-28), which
-- turned two old club-wide policies into leaks:
--
--   players_coach_read   (009) club_id IN get_user_club_ids()
--   feedback_coach_read  (016) club_id IN get_user_club_ids()
--
-- get_user_club_ids() is every club the caller belongs to, in ANY role, so a
-- player could read every teammate's date of birth and staff notes, and every
-- piece of coach feedback written about every teammate. feedback_coach_insert
-- had the same shape, so a player could also write "coach feedback".
--
-- After this: full player rows and feedback are staff-only (head coach +
-- coaches). A player still reads their own row (players_parent_own) and their
-- own feedback (feedback_parent_read). Teammates are visible through
-- get_team_roster(), which returns name, number and position only.

create or replace function public.get_staff_club_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select club_id
    from public.profiles
   where user_id = auth.uid()
     and role in ('doc', 'coach')
     and club_id is not null;
$$;

revoke all on function public.get_staff_club_ids() from public, anon;
grant execute on function public.get_staff_club_ids() to authenticated;

drop policy if exists players_coach_read on public.players;
drop policy if exists players_staff_read on public.players;
create policy players_staff_read on public.players
  for select
  using (club_id in (select public.get_staff_club_ids()));

drop policy if exists feedback_coach_read on public.player_feedback;
drop policy if exists feedback_staff_read on public.player_feedback;
create policy feedback_staff_read on public.player_feedback
  for select
  using (club_id in (select public.get_staff_club_ids()));

drop policy if exists feedback_coach_insert on public.player_feedback;
create policy feedback_coach_insert on public.player_feedback
  for insert
  with check (
    coach_id in (select public.get_user_profile_ids())
    and club_id in (select public.get_staff_club_ids())
  );

-- Safe roster for anyone on the team: no DOB, notes, sizes or owner ids.
create or replace function public.get_team_roster(p_team_id uuid)
returns table (
  id            uuid,
  first_name    text,
  last_name     text,
  jersey_number int,
  "position"    text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.id, p.first_name, p.last_name, p.jersey_number, p.position
    from public.players p
   where p.team_id = p_team_id
     and (
       p_team_id in (select public.get_user_team_ids())
       or p.club_id in (select public.get_staff_club_ids())
       or exists (
         select 1 from public.players mine
          where mine.team_id = p_team_id and mine.parent_id = auth.uid()
       )
     )
   order by p.last_name, p.first_name;
$$;

revoke all on function public.get_team_roster(uuid) from public, anon;
grant execute on function public.get_team_roster(uuid) to authenticated;
