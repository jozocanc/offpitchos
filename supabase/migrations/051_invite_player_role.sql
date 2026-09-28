-- 051_invite_player_role.sql
--
-- OffPitchOS is team-only as of 2026-09-28: members are players, not parents.
-- accept_invite_by_token (033) mapped every non-coach invite to profile role
-- 'parent', so anyone accepting a player invite got profile.role = 'parent'
-- while their team_members row said 'player'. Same function, one mapping fixed.
--
-- Also (same day): one head coach, everyone else is a coach or a player.
--   * staff_title on profiles + invites: "Assistant Coach", "Goalkeeping Coach"...
--     Every titled staff member is still role 'coach'; the title is a label only.
--   * guard_profile_privilege: a signed-in user could previously UPDATE their
--     own profiles.role to 'doc' (profiles_own_update has no column limits).
--     DB policies key DOC power off clubs.created_by, but several server actions
--     check profile.role = 'doc' and then use the service client, so the label
--     was an escalation path. Now only the club creator can hold 'doc', coaches
--     only arrive through an invite (SECURITY DEFINER RPC), and nobody edits
--     their own title.

alter table public.profiles add column if not exists staff_title text
  check (staff_title is null or char_length(staff_title) between 1 and 40);
alter table public.invites add column if not exists staff_title text
  check (staff_title is null or char_length(staff_title) between 1 and 40);


create or replace function public.accept_invite_by_token(
  p_token        uuid,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
-- Pinned search_path: without it this is the `function_search_path_mutable`
-- warning the Supabase linter raises against the other functions here.
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_invite     public.invites%rowtype;
  v_profile_id uuid;
  v_role       text;
  v_name       text;
  v_claimed    boolean := false;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Lock the invite so two concurrent accepts cannot both pass the guard.
  select * into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite has already been used or revoked' using errcode = 'P0001';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'This invite has expired' using errcode = 'P0001';
  end if;

  -- Profile role follows the invite. A 'player' invite used to land as
  -- 'parent' here, while the team_members row correctly said 'player'.
  -- Legacy 'parent' invites keep landing as parent.
  v_role := case v_invite.role
              when 'coach'  then 'coach'
              when 'player' then 'player'
              else 'parent'
            end;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null then
    v_name := 'User';
  end if;

  -- 1. Profile for this club.
  insert into public.profiles (user_id, club_id, role, display_name, onboarding_complete, staff_title)
  values (v_uid, v_invite.club_id, v_role, v_name, true,
          case when v_role = 'coach' then coalesce(v_invite.staff_title, 'Assistant Coach') end)
  on conflict (user_id) do update
    set club_id             = excluded.club_id,
        role                = excluded.role,
        display_name        = excluded.display_name,
        onboarding_complete = true,
        staff_title         = excluded.staff_title
  returning id into v_profile_id;

  -- 2. Team membership, when the invite is scoped to a team.
  if v_invite.team_id is not null then
    insert into public.team_members (team_id, profile_id, role)
    values (v_invite.team_id, v_profile_id, v_invite.role)
    on conflict (team_id, profile_id) do update
      set role = excluded.role;
  end if;

  -- 3. Auto-claim the specific player on a targeted invite. Still
  --    re-checks team membership so a bad invite row cannot cross teams.
  if v_invite.player_id is not null and v_invite.team_id is not null then
    update public.players
       set parent_id = v_uid
     where id = v_invite.player_id
       and team_id = v_invite.team_id;

    v_claimed := found;
  end if;

  -- 4. Consume the invite. This is the write that silently did nothing before.
  update public.invites
     set status      = 'accepted',
         accepted_at = now()
   where id = v_invite.id;

  return jsonb_build_object(
    'ok',            true,
    'club_id',       v_invite.club_id,
    'team_id',       v_invite.team_id,
    'role',          v_role,
    'player_claimed', v_claimed
  );
end;
$$;

-- Only signed-in users may accept an invite. Left executable by `anon` this
-- would be the `anon_security_definer_function_executable` lint, and it would
-- also be pointless: the function needs auth.uid().
-- Backfill: profiles stuck on 'parent' whose every team membership is 'player'.
update public.profiles p
   set role = 'player'
 where p.role = 'parent'
   and exists (select 1 from public.team_members tm where tm.profile_id = p.id)
   and not exists (
     select 1 from public.team_members tm
      where tm.profile_id = p.id and tm.role <> 'player'
   );

-- Existing coaches get the default title.
update public.profiles set staff_title = 'Assistant Coach'
 where role = 'coach' and staff_title is null;

-- Privilege guard. SECURITY INVOKER on purpose: current_user is 'authenticated'
-- for PostgREST calls, but the function owner inside SECURITY DEFINER RPCs
-- (accept_invite_by_token) and 'service_role' for server-side admin writes,
-- and both of those are trusted paths.
create or replace function public.guard_profile_privilege()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Ordinary edits (display name, onboarding flag) pass untouched.
  if tg_op = 'UPDATE'
     and new.role        is not distinct from old.role
     and new.club_id     is not distinct from old.club_id
     and new.staff_title is not distinct from old.staff_title then
    return new;
  end if;

  if new.staff_title is not null
     and (tg_op = 'INSERT' or new.staff_title is distinct from old.staff_title) then
    raise exception 'Only the head coach can set a staff title' using errcode = '42501';
  end if;

  if new.role = 'doc' then
    if new.club_id in (select public.get_doc_club_ids()) then
      return new;
    end if;
    raise exception 'Only the person who created the team can be head coach' using errcode = '42501';
  end if;

  if new.role = 'coach' then
    if tg_op = 'UPDATE' and old.role in ('coach', 'doc')
       and new.club_id is not distinct from old.club_id then
      return new;
    end if;
    raise exception 'Coaches join through an invite from the head coach' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privilege on public.profiles;
create trigger profiles_guard_privilege
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privilege();
