-- 058_one_report_per_game.sql
--
-- Exactly one game report per game, editable any number of times.
--
-- WHY
--
-- 057 allowed one 'confirmed' report plus a 'parsed' draft per game, and the
-- staff's edits in the review table only lived in the browser until they
-- confirmed. Now a game has a single report row:
--
--   status 'parsed'     never saved to player profiles yet
--   status 'confirmed'  saved at least once; player_game_stats holds the live
--                       numbers and team_score/opponent_score the live score
--   draft_rows          the staff's in-progress table (rows, unmatched rows,
--                       scores), autosaved from the modal. Null when there
--                       are no unsaved changes. Players never read it.
--
-- A re-upload replaces the file and extraction on the same row and re-seeds
-- draft_rows; saving ("Save to player profiles") writes player_game_stats,
-- sets confirmed_at/by and clears draft_rows.
--
-- RLS is unchanged: game_reports stays staff-only (057 policies).

-- ---------------------------------------------------------------------------
-- 1. Dedupe: one row per event. Keep the confirmed row, else the newest.
--    Prod had 0 rows when this was written; this is for any other database.
-- ---------------------------------------------------------------------------

-- Storage objects of the dropped rows are not removed here (SQL can't reach
-- the storage API safely); they are orphaned files in a private bucket.
with ranked as (
  select id,
         row_number() over (
           partition by event_id
           order by (status = 'confirmed') desc, created_at desc, id desc
         ) as rn
    from public.game_reports
)
delete from public.game_reports gr
 using ranked r
 where gr.id = r.id
   and r.rn > 1;

-- Stat lines that pointed at a dropped report keep their values (report_id
-- is ON DELETE SET NULL). Re-point them at the surviving report.
update public.player_game_stats s
   set report_id = gr.id
  from public.game_reports gr
 where gr.event_id = s.event_id
   and s.report_id is distinct from gr.id;

-- ---------------------------------------------------------------------------
-- 2. One report per event
-- ---------------------------------------------------------------------------

drop index if exists public.game_reports_one_confirmed_per_event;

create unique index if not exists game_reports_one_per_event
  on public.game_reports (event_id);

-- The plain event_id index from 057 is now redundant with the unique one.
drop index if exists public.game_reports_event_id_idx;

-- ---------------------------------------------------------------------------
-- 3. Draft + audit columns
-- ---------------------------------------------------------------------------

alter table public.game_reports
  add column if not exists draft_rows   jsonb,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by   uuid references auth.users(id) on delete set null;

-- Existing confirmed rows: best guess at when/who saved them.
update public.game_reports
   set confirmed_at = coalesce(confirmed_at, updated_at),
       confirmed_by = coalesce(confirmed_by, created_by)
 where status = 'confirmed'
   and confirmed_at is null;

comment on column public.game_reports.draft_rows is
  'Staff''s unsaved review table: {origin, rows, pending, teamScore, opponentScore}. Null = no unsaved changes. Never shown to players.';
comment on column public.game_reports.confirmed_at is
  'Last time staff saved this report to player profiles.';
comment on column public.game_reports.confirmed_by is
  'auth user who last saved this report to player profiles.';
comment on column public.game_reports.updated_by is
  'auth user who last changed the report (upload, draft autosave, save).';
comment on table public.game_reports is
  'One game report per game (box score upload or manual entry). Staff-only; members read scores via get_game_scores().';
