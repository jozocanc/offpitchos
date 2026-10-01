-- 057_game_stats.sql
--
-- Game reports and per-player game stats.
--
-- WHY
--
-- After every game the staff have an official box score (NJCAA PDF, a web
-- page screenshot, a spreadsheet). They upload it, the AI reads our side of
-- it, staff review and confirm, and the numbers land on every player's
-- profile. Staff can also type the numbers in by hand.
--
-- TABLES
--
--   game_reports       One row per uploaded document (or per manual entry,
--                      storage_path null). status 'parsed' = AI output waiting
--                      for review, 'confirmed' = staff saved it. At most one
--                      confirmed report per event (partial unique index); a
--                      re-upload replaces the old one on confirm.
--   player_game_stats  One row per player per event: unique (event_id,
--                      player_id), so confirming again upserts.
--
-- ACCESS
--
--   Staff (get_staff_club_ids(), 053) of the club: full CRUD on both tables.
--   A player: SELECT their own player_game_stats rows (players.parent_id =
--             auth.uid()). No writes.
--   Team members: the score only, through get_game_scores(event_ids), a
--             SECURITY DEFINER function. game_reports itself stays
--             staff-only because extraction holds the whole box score
--             (both teams, every teammate).
--
-- STORAGE
--
--   Private bucket 'game-reports', path <club_id>/<event_id>/<uuid>.<ext>.
--   The app writes and reads it with the service role after its own staff
--   check (same as event-photos, 020). The policies below are the staff-only
--   backstop for any direct client access.

-- ---------------------------------------------------------------------------
-- game_reports
-- ---------------------------------------------------------------------------

create table if not exists public.game_reports (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id) on delete cascade,
  team_id         uuid not null references public.teams(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  storage_path    text,
  file_name       text check (file_name is null or char_length(file_name) <= 255),
  mime_type       text check (mime_type is null or char_length(mime_type) <= 150),
  status          text not null default 'parsed' check (status in ('parsed', 'confirmed')),
  extraction      jsonb,
  team_score      smallint check (team_score is null or team_score >= 0),
  opponent_score  smallint check (opponent_score is null or opponent_score >= 0),
  created_by      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists game_reports_event_id_idx on public.game_reports (event_id);
create index if not exists game_reports_club_id_idx on public.game_reports (club_id);

create unique index if not exists game_reports_one_confirmed_per_event
  on public.game_reports (event_id)
  where status = 'confirmed';

drop trigger if exists game_reports_updated_at on public.game_reports;
create trigger game_reports_updated_at
  before update on public.game_reports
  for each row execute function public.update_updated_at();

alter table public.game_reports enable row level security;

drop policy if exists game_reports_staff_select on public.game_reports;
create policy game_reports_staff_select on public.game_reports
  for select
  using (club_id in (select public.get_staff_club_ids()));

-- Insert/update also pin club_id and team_id to the event's own, so a coach
-- cannot attach a report for their club to another club's event.
drop policy if exists game_reports_staff_insert on public.game_reports;
create policy game_reports_staff_insert on public.game_reports
  for insert
  with check (
    club_id in (select public.get_staff_club_ids())
    and exists (
      select 1 from public.events e
       where e.id = game_reports.event_id
         and e.club_id = game_reports.club_id
         and e.team_id = game_reports.team_id
    )
  );

drop policy if exists game_reports_staff_update on public.game_reports;
create policy game_reports_staff_update on public.game_reports
  for update
  using (club_id in (select public.get_staff_club_ids()))
  with check (
    club_id in (select public.get_staff_club_ids())
    and exists (
      select 1 from public.events e
       where e.id = game_reports.event_id
         and e.club_id = game_reports.club_id
         and e.team_id = game_reports.team_id
    )
  );

drop policy if exists game_reports_staff_delete on public.game_reports;
create policy game_reports_staff_delete on public.game_reports
  for delete
  using (club_id in (select public.get_staff_club_ids()));

revoke all on public.game_reports from anon;

comment on table public.game_reports is
  'Uploaded game reports (box scores) and manual stat entries. Staff-only; members read scores via get_game_scores().';
comment on column public.game_reports.extraction is
  'Raw structured AI output (our side only), kept for audit and re-review.';
comment on column public.game_reports.storage_path is
  'Object path in the private game-reports bucket. Null for manual entry.';


-- ---------------------------------------------------------------------------
-- player_game_stats
-- ---------------------------------------------------------------------------

create table if not exists public.player_game_stats (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubs(id) on delete cascade,
  team_id        uuid not null references public.teams(id) on delete cascade,
  event_id       uuid not null references public.events(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  report_id      uuid references public.game_reports(id) on delete set null,
  started        boolean not null default false,
  minutes        smallint check (minutes is null or minutes between 0 and 200),
  goals          smallint not null default 0 check (goals >= 0),
  assists        smallint not null default 0 check (assists >= 0),
  shots          smallint not null default 0 check (shots >= 0),
  shots_on_goal  smallint not null default 0 check (shots_on_goal >= 0),
  yellow_cards   smallint not null default 0 check (yellow_cards >= 0),
  red_cards      smallint not null default 0 check (red_cards >= 0),
  saves          smallint check (saves is null or saves >= 0),
  goals_against  smallint check (goals_against is null or goals_against >= 0),
  created_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (event_id, player_id)
);

create index if not exists player_game_stats_player_id_idx on public.player_game_stats (player_id);
create index if not exists player_game_stats_club_id_idx on public.player_game_stats (club_id);
create index if not exists player_game_stats_report_id_idx on public.player_game_stats (report_id);

drop trigger if exists player_game_stats_updated_at on public.player_game_stats;
create trigger player_game_stats_updated_at
  before update on public.player_game_stats
  for each row execute function public.update_updated_at();

alter table public.player_game_stats enable row level security;

drop policy if exists player_game_stats_player_select on public.player_game_stats;
create policy player_game_stats_player_select on public.player_game_stats
  for select
  using (
    exists (
      select 1 from public.players p
       where p.id = player_game_stats.player_id
         and p.parent_id = auth.uid()
    )
  );

drop policy if exists player_game_stats_staff_select on public.player_game_stats;
create policy player_game_stats_staff_select on public.player_game_stats
  for select
  using (club_id in (select public.get_staff_club_ids()));

-- Writes: the row's club/team must match both the event and the player, so a
-- stat line can't be planted on another team's player or game.
drop policy if exists player_game_stats_staff_insert on public.player_game_stats;
create policy player_game_stats_staff_insert on public.player_game_stats
  for insert
  with check (
    club_id in (select public.get_staff_club_ids())
    and exists (
      select 1 from public.events e
       where e.id = player_game_stats.event_id
         and e.club_id = player_game_stats.club_id
         and e.team_id = player_game_stats.team_id
    )
    and exists (
      select 1 from public.players p
       where p.id = player_game_stats.player_id
         and p.club_id = player_game_stats.club_id
         and p.team_id = player_game_stats.team_id
    )
  );

drop policy if exists player_game_stats_staff_update on public.player_game_stats;
create policy player_game_stats_staff_update on public.player_game_stats
  for update
  using (club_id in (select public.get_staff_club_ids()))
  with check (
    club_id in (select public.get_staff_club_ids())
    and exists (
      select 1 from public.events e
       where e.id = player_game_stats.event_id
         and e.club_id = player_game_stats.club_id
         and e.team_id = player_game_stats.team_id
    )
    and exists (
      select 1 from public.players p
       where p.id = player_game_stats.player_id
         and p.club_id = player_game_stats.club_id
         and p.team_id = player_game_stats.team_id
    )
  );

drop policy if exists player_game_stats_staff_delete on public.player_game_stats;
create policy player_game_stats_staff_delete on public.player_game_stats
  for delete
  using (club_id in (select public.get_staff_club_ids()));

revoke all on public.player_game_stats from anon;

comment on table public.player_game_stats is
  'One stat line per player per game. Staff write; a player reads their own rows.';
comment on column public.player_game_stats.saves is
  'Goalkeepers only; null for outfield players.';


-- ---------------------------------------------------------------------------
-- Scores for members
-- ---------------------------------------------------------------------------
--
-- Final score of confirmed reports for the given events, limited to events of
-- teams the caller belongs to (team_members), owns a roster row on, or staffs.
-- Nothing else from game_reports leaves this function.

create or replace function public.get_game_scores(p_event_ids uuid[])
returns table (
  event_id        uuid,
  team_score      smallint,
  opponent_score  smallint
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select gr.event_id, gr.team_score, gr.opponent_score
    from public.game_reports gr
   where gr.event_id = any (p_event_ids)
     and gr.status = 'confirmed'
     and (
       gr.club_id in (select public.get_staff_club_ids())
       or gr.team_id in (select public.get_user_team_ids())
       or exists (
         select 1 from public.players p
          where p.team_id = gr.team_id
            and p.parent_id = auth.uid()
       )
     );
$$;

revoke all on function public.get_game_scores(uuid[]) from public, anon;
grant execute on function public.get_game_scores(uuid[]) to authenticated;


-- ---------------------------------------------------------------------------
-- Storage: private bucket, staff-only
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('game-reports', 'game-reports', false)
on conflict (id) do nothing;

-- First path segment is the club id: <club_id>/<event_id>/<file>.
drop policy if exists game_reports_obj_select on storage.objects;
create policy game_reports_obj_select on storage.objects
  for select
  using (
    bucket_id = 'game-reports'
    and (storage.foldername(name))[1] in (
      select c::text from public.get_staff_club_ids() as c
    )
  );

drop policy if exists game_reports_obj_insert on storage.objects;
create policy game_reports_obj_insert on storage.objects
  for insert
  with check (
    bucket_id = 'game-reports'
    and (storage.foldername(name))[1] in (
      select c::text from public.get_staff_club_ids() as c
    )
  );

drop policy if exists game_reports_obj_update on storage.objects;
create policy game_reports_obj_update on storage.objects
  for update
  using (
    bucket_id = 'game-reports'
    and (storage.foldername(name))[1] in (
      select c::text from public.get_staff_club_ids() as c
    )
  );

drop policy if exists game_reports_obj_delete on storage.objects;
create policy game_reports_obj_delete on storage.objects
  for delete
  using (
    bucket_id = 'game-reports'
    and (storage.foldername(name))[1] in (
      select c::text from public.get_staff_club_ids() as c
    )
  );
