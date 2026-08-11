-- 033_accept_invite_rpc.sql
--
-- Fixes a silent failure in the invite-accept flow.
--
-- app/join/[token]/actions.ts performed three writes as the INVITEE (a coach or
-- parent, never a DOC):
--
--   1. upsert profiles            -- worked
--   2. upsert team_members        -- worked (migrations 029 / 031)
--   3. update invites -> accepted -- SILENTLY DROPPED
--   4. update players -> claim    -- SILENTLY DROPPED
--
-- The only policy on `invites` is invites_doc_all (club_id IN get_doc_club_ids()),
-- and players_parent_own is (parent_id = auth.uid()) which is false *before* the
-- claim. Both updates therefore matched zero rows. A zero-row UPDATE is not an
-- error, and neither call checked a row count, so the flow reported success.
--
-- Consequences that were live in production:
--   * invites.status stayed 'pending' forever, so the `status <> 'pending'`
--     guard in acceptInvite could never fire and an invite link was reusable by
--     anyone holding it for its whole validity window (7d coach / 30d player).
--   * dashboard/coaches/page.tsx filters .eq('status','pending'), so a coach who
--     had already joined still showed as an outstanding invite until expiry.
--   * the targeted "you're Billy Smith's parent" auto-claim never linked a
--     single parent to a child.
--
-- Fix: one SECURITY DEFINER function that does the whole accept atomically,
-- mirroring the existing get_invite_by_token RPC pattern. Authorization is
-- possession of the token, which is the design intent of an invite link.
--
-- The function only ever writes rows for auth.uid() (never an arbitrary user),
-- only touches the invite matching the supplied token, and constrains the
-- player claim to that invite's team.

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

  -- Mirrors the mapping in the server action: anything that is not an explicit
  -- coach invite lands as a parent.
  v_role := case when v_invite.role = 'coach' then 'coach' else 'parent' end;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null then
    v_name := 'User';
  end if;

  -- 1. Profile for this club.
  insert into public.profiles (user_id, club_id, role, display_name, onboarding_complete)
  values (v_uid, v_invite.club_id, v_role, v_name, true)
  on conflict (user_id) do update
    set club_id             = excluded.club_id,
        role                = excluded.role,
        display_name        = excluded.display_name,
        onboarding_complete = true
  returning id into v_profile_id;

  -- 2. Team membership, when the invite is scoped to a team.
  if v_invite.team_id is not null then
    insert into public.team_members (team_id, profile_id, role)
    values (v_invite.team_id, v_profile_id, v_invite.role)
    on conflict (team_id, profile_id) do update
      set role = excluded.role;
  end if;

  -- 3. Auto-claim the specific player on a targeted parent invite. Still
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
revoke all on function public.accept_invite_by_token(uuid, text) from public, anon;
grant execute on function public.accept_invite_by_token(uuid, text) to authenticated;

comment on function public.accept_invite_by_token(uuid, text) is
  'Atomically accepts an invite by token: upserts the caller''s profile and team membership, claims a targeted player, and marks the invite accepted. SECURITY DEFINER because the invitee is not a DOC and so cannot satisfy invites_doc_all. Authorization is possession of the token.';
