-- 034_attendance_staff_scope.sql
--
-- Closes an authorization gap on `attendance`.
--
-- attendance_staff_all was `FOR ALL` gated on
--   event_id IN (SELECT e.id FROM events e WHERE e.club_id IN (SELECT get_user_club_ids()))
--
-- but get_user_club_ids() is role-blind:
--   SELECT club_id FROM profiles WHERE user_id = auth.uid() AND club_id IS NOT NULL
--
-- so despite the "_staff_" in the name it matched PARENTS too. Verified against
-- production: a parent rostered to a team (which is exactly what invite-accept
-- creates) could insert an attendance row for a child that was not theirs —
-- ALLOWED, 1 row. Not reachable through the UI, but reachable through PostgREST
-- with the parent's own JWT.
--
-- Parents do have one legitimate attendance write: parentExcuseChildren()
-- (app/dashboard/schedule/attendance-actions.ts:107) upserts status 'excused'
-- for their own kids. So this cannot simply be narrowed to staff — that would
-- fix the hole by breaking the feature. Instead:
--
--   * staff policy is repointed at a new role-aware get_staff_club_ids()
--   * parents get INSERT + UPDATE scoped strictly to their own children,
--     which is what the upsert needs and nothing more
--   * parents deliberately get no DELETE, so they cannot erase a coach's record
--
-- Deliberately NOT constraining parents to status='excused'. The TypeScript
-- already does that, and the gap being closed here is writes to *other people's*
-- children, not what a parent records against their own.

-- Role-aware counterpart to get_user_club_ids(). search_path is pinned, unlike
-- the older helpers, which the Supabase linter flags as
-- function_search_path_mutable.
create or replace function public.get_staff_club_ids()
returns setof uuid
language sql
stable
security definer
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

comment on function public.get_staff_club_ids() is
  'Clubs where the caller is staff (doc or coach). Role-aware counterpart to get_user_club_ids(), which matches any club member including parents.';

-- Staff: unchanged shape, role-aware source.
drop policy if exists attendance_staff_all on public.attendance;

create policy attendance_staff_all on public.attendance
  for all
  using (
    event_id in (
      select e.id from public.events e
      where e.club_id in (select public.get_staff_club_ids())
    )
  )
  with check (
    event_id in (
      select e.id from public.events e
      where e.club_id in (select public.get_staff_club_ids())
    )
  );

-- Parents: own children only. Split INSERT and UPDATE rather than FOR ALL so
-- that DELETE stays staff-only. attendance_parent_read already covers SELECT.
drop policy if exists attendance_parent_insert on public.attendance;
drop policy if exists attendance_parent_update on public.attendance;

create policy attendance_parent_insert on public.attendance
  for insert
  with check (
    player_id in (select id from public.players where parent_id = auth.uid())
  );

create policy attendance_parent_update on public.attendance
  for update
  using (
    player_id in (select id from public.players where parent_id = auth.uid())
  )
  with check (
    player_id in (select id from public.players where parent_id = auth.uid())
  );
