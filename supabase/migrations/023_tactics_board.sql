-- ============================================================
-- 023_tactics_board.sql — Tactics Board Phase A
--
-- drills: coach-authored drill diagrams with visibility scoping
-- event_drills: join table attaching drills to schedule events
-- drill-thumbnails: storage bucket for PNG previews
-- ============================================================

create table drills (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null default 'Untitled drill',
  description text not null default '',
  category text not null default 'other'
    check (category in ('rondo','build-up','pressing','finishing','warm-up','ssg','transition','other')),
  visibility text not null default 'private'
    check (visibility in ('private','team','club')),
  field jsonb not null default '{"width_m":40,"length_m":60,"units":"m","orientation":"horizontal","half_field":true,"style":"schematic"}'::jsonb,
  objects jsonb not null default '[]'::jsonb,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_drills_club_team_updated on drills(club_id, team_id, updated_at desc);
create index idx_drills_creator_updated on drills(created_by, updated_at desc);
create index idx_drills_category on drills(club_id, category);

create or replace function touch_drills_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_drills_updated
  before update on drills
  for each row execute function touch_drills_updated_at();

create table event_drills (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  drill_id uuid not null references drills(id) on delete cascade,
  order_index int not null default 0,
  duration_minutes int not null default 15 check (duration_minutes > 0),
  coach_notes text,
  created_at timestamptz not null default now()
);

create index idx_event_drills_event_order on event_drills(event_id, order_index);

alter table drills enable row level security;
alter table event_drills enable row level security;

-- Helper: return the caller's profile (role + club_id)
create or replace function drills_caller_profile() returns table(profile_id uuid, role text, club_id uuid)
  language sql stable security definer set search_path = public as $$
  select id, role, club_id from profiles where user_id = auth.uid() limit 1;
$$;

-- Helper: is caller rostered to team?
create or replace function drills_is_rostered(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members tm
    join profiles p on p.id = tm.profile_id
    where tm.team_id = p_team_id and p.user_id = auth.uid()
  );
$$;

-- SELECT: creator OR club-wide visible OR team-visible and rostered (or doc)
create policy drills_select on drills for select using (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.role in ('doc','coach') and cp.club_id = drills.club_id and (
      drills.created_by = cp.profile_id
      or (drills.visibility = 'club')
      or (drills.visibility = 'team' and drills.team_id is not null
          and (cp.role = 'doc' or drills_is_rostered(drills.team_id)))
    )
  )
);

-- INSERT: doc or coach in same club; team_id null requires doc; otherwise doc or rostered
create policy drills_insert on drills for insert with check (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.role in ('doc','coach')
      and cp.club_id = drills.club_id
      and cp.profile_id = drills.created_by
      and (
        (drills.team_id is null and cp.role = 'doc')
        or (drills.team_id is not null and (cp.role = 'doc' or drills_is_rostered(drills.team_id)))
      )
  )
);

-- UPDATE: creator, doc in same club, or rostered coach on non-private drill
create policy drills_update on drills for update using (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.role in ('doc','coach') and cp.club_id = drills.club_id and (
      drills.created_by = cp.profile_id
      or cp.role = 'doc'
      or (cp.role = 'coach' and drills.visibility <> 'private'
          and drills.team_id is not null and drills_is_rostered(drills.team_id))
    )
  )
);

-- DELETE: creator or doc
create policy drills_delete on drills for delete using (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.club_id = drills.club_id and (
      drills.created_by = cp.profile_id or cp.role = 'doc'
    )
  )
);

-- event_drills: can read if you're doc/coach on the event's team
create policy event_drills_select on event_drills for select using (
  exists (
    select 1 from events e
    join teams t on t.id = e.team_id
    join drills_caller_profile() cp on cp.club_id = t.club_id
    where e.id = event_drills.event_id and cp.role in ('doc','coach')
      and (cp.role = 'doc' or drills_is_rostered(t.id))
  )
);

create policy event_drills_write on event_drills for all using (
  exists (
    select 1 from events e
    join teams t on t.id = e.team_id
    join drills_caller_profile() cp on cp.club_id = t.club_id
    where e.id = event_drills.event_id and cp.role in ('doc','coach')
      and (cp.role = 'doc' or drills_is_rostered(t.id))
  )
) with check (
  exists (
    select 1 from events e
    join teams t on t.id = e.team_id
    join drills_caller_profile() cp on cp.club_id = t.club_id
    where e.id = event_drills.event_id and cp.role in ('doc','coach')
      and (cp.role = 'doc' or drills_is_rostered(t.id))
  )
);

-- Storage bucket + policies
insert into storage.buckets (id, name, public)
values ('drill-thumbnails', 'drill-thumbnails', true)
on conflict (id) do nothing;

create policy drill_thumbs_read on storage.objects for select
  using (bucket_id = 'drill-thumbnails');

create policy drill_thumbs_write on storage.objects for insert
  with check (
    bucket_id = 'drill-thumbnails'
    and exists (
      select 1 from drills_caller_profile() cp
      where cp.role in ('doc','coach')
        and (storage.foldername(name))[1] = cp.club_id::text
    )
  );

create policy drill_thumbs_update on storage.objects for update
  using (
    bucket_id = 'drill-thumbnails'
    and exists (
      select 1 from drills_caller_profile() cp
      where cp.role in ('doc','coach')
        and (storage.foldername(name))[1] = cp.club_id::text
    )
  );

create policy drill_thumbs_delete on storage.objects for delete
  using (
    bucket_id = 'drill-thumbnails'
    and exists (
      select 1 from drills_caller_profile() cp
      where cp.role in ('doc','coach')
        and (storage.foldername(name))[1] = cp.club_id::text
    )
  );
