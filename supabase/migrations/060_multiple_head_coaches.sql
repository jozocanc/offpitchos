-- 060: every coach on the staff gets head-coach permissions.
--
-- Jozo (2026-10-03): "all of the coaching staff have access", with one
-- exception: only the head coach (the club creator) can delete the program.
--
-- Every *_doc_* policy goes through get_doc_club_ids() / get_doc_team_ids(),
-- so widening those two to "creator OR a live staff profile (doc or coach) in
-- that club" opens the same writes to assistants. Deleting the club stays on
-- clubs_doc_all (created_by = auth.uid()).
--
-- Escalation: guard_profile_privilege() let a profile become 'doc' when its club
-- was in get_doc_club_ids(). Coaches are in that set now, so the guard checks
-- the creator directly instead: only the club creator holds role 'doc'.

create or replace function public.get_doc_club_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from clubs where created_by = auth.uid()
  union
  select club_id from profiles
   where user_id = auth.uid()
     and role in ('doc', 'coach')
     and club_id is not null
     and deleted_at is null;
$$;

create or replace function public.get_doc_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id from teams t
   where t.club_id in (select public.get_doc_club_ids());
$$;

-- Staff can edit program settings (name, timezone). Insert and delete stay
-- creator-only through clubs_doc_all.
drop policy if exists clubs_cohead_update on public.clubs;
create policy clubs_cohead_update on public.clubs
  for update
  using (id in (select public.get_doc_club_ids()))
  with check (id in (select public.get_doc_club_ids()));

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
    if exists (select 1 from public.clubs c where c.id = new.club_id and c.created_by = auth.uid()) then
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
