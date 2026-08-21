-- GPS load per player per session, imported from a vest export.
--
-- The point is NOT to rebuild the vendor's dashboard. Titan (now Hudl), WIMU,
-- Catapult and STATSports all ship 100+ metrics and a visualisation layer that
-- is their actual product. What none of them has is the countable-hours side,
-- and what ARMS has is the hours with no load. Joining the two is the only part
-- of this nobody already sells.
--
-- Columns are the metrics every vendor exports under some name. Anything else
-- in the file is kept verbatim in `extra` rather than dropped, so a club can
-- change vendor without losing the numbers they had.

create table if not exists event_player_load (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references clubs(id)   on delete cascade,
  event_id   uuid not null references events(id)  on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,

  duration_min          numeric,
  distance_m            numeric,
  high_speed_distance_m numeric,
  sprints               integer,
  top_speed_kmh         numeric,
  accelerations         integer,
  decelerations         integer,
  player_load           numeric,

  -- Vendor columns we have no dedicated home for, as exported.
  extra       jsonb not null default '{}'::jsonb,
  -- Which export produced this, for when a club runs two vest systems.
  source      text not null default 'csv',
  imported_at timestamptz not null default now(),

  -- Re-importing a corrected export should overwrite, not duplicate.
  unique (event_id, player_id)
);

-- The unique constraint indexes (event_id, player_id), which serves lookups by
-- event. The other two foreign keys need their own.
create index if not exists event_player_load_player_id_idx on event_player_load (player_id);
create index if not exists event_player_load_club_id_idx   on event_player_load (club_id);

alter table event_player_load enable row level security;

-- Staff only, deliberately. get_staff_club_ids() is the role-aware helper from
-- 034 (role in ('doc','coach'), search_path pinned) rather than
-- get_user_team_ids(), which matches every rostered parent and is what caused
-- the 034 / 036 / 038 leaks.
--
-- No player-read policy yet: players have no accounts, they reach the app
-- through the tokenised /collect link. When they do get accounts, "a player
-- reads their own load" is a separate policy and wants its own review.
create policy event_player_load_staff_all on public.event_player_load
  for all
  using      (club_id in (select get_staff_club_ids()))
  with check (club_id in (select get_staff_club_ids()));

-- Remembered column mapping, so a coach maps their export's headers once
-- rather than on every upload.
alter table club_settings
  add column if not exists gps_column_map jsonb;

comment on column club_settings.gps_column_map is
  'Header-to-field mapping for this club''s GPS export, e.g. {"Total Distance (m)":"distance_m"}. Set on first import, reused after.';
