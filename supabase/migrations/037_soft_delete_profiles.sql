-- 037_soft_delete_profiles.sql
--
-- Makes "Leave club" and "Delete my account" actually do something.
--
-- Both live in app/dashboard/settings/actions.ts and both ran
--   delete from team_members ...
--   delete from profiles ...
-- unchecked, then returned { success: true }.
--
-- There is NO DELETE policy on profiles (only own_insert / own_read /
-- doc_read / own_update) and no self-delete on team_members (only
-- team_members_doc_all). Verified against production, acting as the user
-- themselves: 0 team_members rows deleted, 0 profiles rows deleted, profile
-- still present, auth user still present. leaveClub even blocks DOCs first,
-- so the only callers who reached those deletes were exactly the roles with
-- no permission — it failed 100% of the time.
--
-- Hard delete is not the fix. profiles is referenced by three NO ACTION
-- foreign keys — camp_registrations.registered_by, drill_versions.saved_by,
-- player_feedback.coach_id — so any coach who has ever given player feedback
-- cannot be deleted at all, and cascading the rest would silently destroy a
-- club's announcements, drills and coverage history.
--
-- Soft delete instead. The key insight is that nulling club_id does most of
-- the work for free:
--   * get_user_club_ids(), get_staff_club_ids() -> empty (they filter
--     club_id IS NOT NULL)
--   * get_user_team_ids() -> empty once team_members rows are gone
--   * profiles_doc_read (club_id IN get_doc_club_ids()) stops matching, so the
--     deleted user disappears from the DOC's roster automatically
-- so no policy or helper function needs rewriting, and authored history keeps
-- its foreign keys intact pointing at a scrubbed profile.
--
-- onboarding_complete is set back to false so that if the account is ever
-- reinstated the user lands in onboarding rather than on a dashboard with a
-- null club.
--
-- SECURITY DEFINER is required for one specific reason: team_members has no
-- self-delete policy, so the user cannot remove their own memberships.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the user soft-deletes their account. Non-null means the profile is scrubbed and detached from its club; history rows keep referencing it.';

create index if not exists idx_profiles_active
  on public.profiles (user_id) where deleted_at is null;

-- Leave club: detach, keep the account.
create or replace function public.leave_own_club()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_pid  uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select id, role into v_pid, v_role
  from public.profiles
  where user_id = v_uid and deleted_at is null;

  if v_pid is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_role = 'doc' then
    raise exception 'A Director of Coaching cannot leave their own club. Transfer ownership first.'
      using errcode = 'P0001';
  end if;

  delete from public.team_members where profile_id = v_pid;

  update public.profiles
     set club_id = null,
         onboarding_complete = false
   where id = v_pid;

  return jsonb_build_object('ok', true);
end;
$$;

-- Delete account: scrub and detach, keep referential integrity.
create or replace function public.soft_delete_own_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_pid     uuid;
  v_role    text;
  v_club    uuid;
  v_others  int;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select id, role, club_id into v_pid, v_role, v_club
  from public.profiles
  where user_id = v_uid and deleted_at is null;

  if v_pid is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  -- A DOC still owns their club through clubs.created_by, and nothing
  -- inherits it, so letting them vanish would strand every remaining member.
  -- Allowed only once they are the last person in it.
  if v_role = 'doc' and v_club is not null then
    select count(*) into v_others
    from public.profiles
    where club_id = v_club and id <> v_pid and deleted_at is null;

    if v_others > 0 then
      raise exception 'Transfer ownership of your club before deleting your account. % other % still in it.',
        v_others, case when v_others = 1 then 'person is' else 'people are' end
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.team_members where profile_id = v_pid;

  update public.profiles
     set deleted_at          = coalesce(deleted_at, now()),
         display_name        = 'Deleted user',
         club_id             = null,
         onboarding_complete = false
   where id = v_pid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.leave_own_club()          from public, anon;
revoke all on function public.soft_delete_own_profile() from public, anon;
grant execute on function public.leave_own_club()          to authenticated;
grant execute on function public.soft_delete_own_profile() to authenticated;

comment on function public.leave_own_club() is
  'Detaches the caller from their club: removes team memberships and nulls club_id. SECURITY DEFINER because team_members has no self-delete policy.';

comment on function public.soft_delete_own_profile() is
  'Soft-deletes the caller: scrubs display_name, sets deleted_at, removes team memberships and nulls club_id. Hard delete is impossible because of NO ACTION FKs from camp_registrations, drill_versions and player_feedback.';
