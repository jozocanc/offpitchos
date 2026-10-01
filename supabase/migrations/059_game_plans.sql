-- 059_game_plans.sql
--
-- Game plan per game / tournament event: lineup, corners, attached drills.
--
-- WHY
--
-- Before a game the staff pick a formation and a starting XI, set up their
-- corners and pull a couple of boards from the tactics library. They print it
-- for the dressing room and the referee, and optionally share the lineup and
-- set pieces with the players.
--
-- TABLE
--
--   game_plans   One row per event (unique event_id).
--     formation      preset name, e.g. '4-3-3' (lib/game-plan.ts).
--     lineup         { slots: [{ slot_id, label, x, y, player_id|null }],
--                      bench: [player_id], captain_id }
--                    x/y are 0..1 on a portrait pitch, our goal at the bottom.
--     set_pieces     { corner_attack_left, corner_attack_right, corner_defend }
--                    each null until set up, else
--                    { setup: 'zonal'|'man'|'mixed'|null,
--                      markers: [{ id, player_id|null, slot_id?, x, y, role_label }],
--                      arrows: [{ id, x1, y1, x2, y2 }], notes }
--                    x/y are 0..1 on the half-pitch box view.
--     drill_ids      attached tactics-library drills, in print order.
--     shared_with_players   players may read the plan (lineup + set pieces).
--     shared_notified_at    set the first time the plan is shared, when the
--                           one-off "Lineup is out" push goes out. Never reset,
--                           so toggling sharing off and on does not re-push.
--
-- Player names and numbers are NOT stored: lineup and markers hold player ids
-- only and the app reads name / number live from the roster, so a corrected
-- jersey number shows up on the plan without touching it.
--
-- ACCESS
--
--   Staff (get_staff_club_ids(), 053) of the club: full CRUD. Writes pin
--   club_id and team_id to the event's own.
--   Team members / players: SELECT only, and only while shared_with_players
--   is true, for a team they belong to (get_user_team_ids()) or own a roster
--   row on (players.parent_id = auth.uid()). No member writes.

create table if not exists public.game_plans (
  id                   uuid primary key default gen_random_uuid(),
  club_id              uuid not null references public.clubs(id) on delete cascade,
  team_id              uuid not null references public.teams(id) on delete cascade,
  event_id             uuid not null unique references public.events(id) on delete cascade,
  formation            text not null default '4-3-3'
                         check (char_length(formation) between 1 and 16),
  lineup               jsonb not null default '{"slots": [], "bench": [], "captain_id": null}'::jsonb
                         check (jsonb_typeof(lineup) = 'object' and pg_column_size(lineup) <= 65536),
  set_pieces           jsonb not null default '{"corner_attack_left": null, "corner_attack_right": null, "corner_defend": null}'::jsonb
                         check (jsonb_typeof(set_pieces) = 'object' and pg_column_size(set_pieces) <= 131072),
  drill_ids            uuid[] not null default '{}'
                         check (cardinality(drill_ids) <= 20),
  notes                text check (notes is null or char_length(notes) <= 4000),
  shared_with_players  boolean not null default false,
  shared_notified_at   timestamptz,
  updated_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists game_plans_club_id_idx on public.game_plans (club_id);
create index if not exists game_plans_team_id_idx on public.game_plans (team_id);

drop trigger if exists game_plans_updated_at on public.game_plans;
create trigger game_plans_updated_at
  before update on public.game_plans
  for each row execute function public.update_updated_at();

alter table public.game_plans enable row level security;

-- ---------------------------------------------------------------------------
-- Staff: full access in their club
-- ---------------------------------------------------------------------------

drop policy if exists game_plans_staff_select on public.game_plans;
create policy game_plans_staff_select on public.game_plans
  for select
  using (club_id in (select public.get_staff_club_ids()));

-- Insert/update pin club_id and team_id to the event's own, and only games
-- and tournaments get a plan.
drop policy if exists game_plans_staff_insert on public.game_plans;
create policy game_plans_staff_insert on public.game_plans
  for insert
  with check (
    club_id in (select public.get_staff_club_ids())
    and exists (
      select 1 from public.events e
       where e.id = game_plans.event_id
         and e.club_id = game_plans.club_id
         and e.team_id = game_plans.team_id
         and e.type in ('game', 'tournament')
    )
  );

drop policy if exists game_plans_staff_update on public.game_plans;
create policy game_plans_staff_update on public.game_plans
  for update
  using (club_id in (select public.get_staff_club_ids()))
  with check (
    club_id in (select public.get_staff_club_ids())
    and exists (
      select 1 from public.events e
       where e.id = game_plans.event_id
         and e.club_id = game_plans.club_id
         and e.team_id = game_plans.team_id
         and e.type in ('game', 'tournament')
    )
  );

drop policy if exists game_plans_staff_delete on public.game_plans;
create policy game_plans_staff_delete on public.game_plans
  for delete
  using (club_id in (select public.get_staff_club_ids()));

-- ---------------------------------------------------------------------------
-- Players / team members: read-only, shared plans of their own team
-- ---------------------------------------------------------------------------

drop policy if exists game_plans_member_select on public.game_plans;
create policy game_plans_member_select on public.game_plans
  for select
  using (
    shared_with_players = true
    and (
      team_id in (select public.get_user_team_ids())
      or exists (
        select 1 from public.players p
         where p.team_id = game_plans.team_id
           and p.parent_id = auth.uid()
      )
    )
  );

revoke all on public.game_plans from anon;

comment on table public.game_plans is
  'One game plan per game/tournament event: formation, lineup, corners, attached drills. Staff write; players read when shared_with_players.';
comment on column public.game_plans.lineup is
  '{ slots: [{ slot_id, label, x, y, player_id }], bench: [player_id], captain_id }. Ids only; names and numbers come live from the roster.';
comment on column public.game_plans.set_pieces is
  '{ corner_attack_left, corner_attack_right, corner_defend }, each null until set up.';
comment on column public.game_plans.shared_notified_at is
  'When the one-off "Lineup is out" push was sent. Never reset.';
