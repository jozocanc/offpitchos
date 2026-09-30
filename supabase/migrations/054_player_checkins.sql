-- 054_player_checkins.sql
--
-- Daily player check-in (wellness + availability) and the staff Readiness
-- board built on it. First pilot: Tyler Junior College men's soccer.
--
-- WHAT A CHECK-IN IS
--
-- One row per player per TEAM-LOCAL calendar day: sleep, soreness and energy
-- on a 1-5 scale, an availability call (fit / limited / out) and an optional
-- private note. checkin_date is computed server-side in the team's timezone
-- (clubs.timezone), never the server's or the phone's, so a player checking
-- in at 11:30 PM Central lands on the right day.
--
-- Scale direction: sleep and energy are 1 = poor/low, 5 = great/high.
-- Soreness is inverted by nature: 1 = fresh, 5 = very sore.
--
-- RLS
--
--   checkins_player_select  a player reads rows for the roster row they own
--                           (players.parent_id = auth.uid()).
--   checkins_player_insert  a player writes only for a roster row they own,
--   checkins_player_update  and club_id/team_id on the check-in must match
--                           that roster row, so nobody can plant a row into
--                           another team's board. created_by must be the
--                           caller.
--   checkins_staff_select   staff (get_staff_club_ids(), 034/053) read every
--                           row in their club.
--   checkins_staff_delete   staff may delete in their club. Players cannot
--                           delete (an 'out' call should not vanish).
--
-- Teammates cannot read each other's check-ins: there is no member-wide read
-- policy. The note is private to the player and staff.
--
-- Staff do not insert or update check-ins; the board is read-only for them.

create table if not exists public.player_checkins (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  checkin_date  date not null,
  sleep         smallint not null check (sleep between 1 and 5),
  soreness      smallint not null check (soreness between 1 and 5),
  energy        smallint not null check (energy between 1 and 5),
  status        text not null check (status in ('fit', 'limited', 'out')),
  note          text check (note is null or char_length(note) <= 280),
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (player_id, checkin_date)
);

create index if not exists idx_player_checkins_club_date
  on public.player_checkins (club_id, checkin_date);

drop trigger if exists player_checkins_updated_at on public.player_checkins;
create trigger player_checkins_updated_at
  before update on public.player_checkins
  for each row execute function public.update_updated_at();

alter table public.player_checkins enable row level security;

drop policy if exists checkins_player_select on public.player_checkins;
create policy checkins_player_select on public.player_checkins
  for select
  using (
    exists (
      select 1 from public.players p
       where p.id = player_checkins.player_id
         and p.parent_id = auth.uid()
    )
  );

drop policy if exists checkins_player_insert on public.player_checkins;
create policy checkins_player_insert on public.player_checkins
  for insert
  with check (
    created_by = auth.uid()
    -- No back- or forward-dating by calling the API directly; one day of
    -- slack either side covers every team timezone.
    and checkin_date between (current_date - 1) and (current_date + 1)
    and exists (
      select 1 from public.players p
       where p.id = player_checkins.player_id
         and p.parent_id = auth.uid()
         and p.club_id = player_checkins.club_id
         and p.team_id = player_checkins.team_id
    )
  );

drop policy if exists checkins_player_update on public.player_checkins;
create policy checkins_player_update on public.player_checkins
  for update
  using (
    exists (
      select 1 from public.players p
       where p.id = player_checkins.player_id
         and p.parent_id = auth.uid()
    )
  )
  with check (
    created_by = auth.uid()
    -- No back- or forward-dating by calling the API directly; one day of
    -- slack either side covers every team timezone.
    and checkin_date between (current_date - 1) and (current_date + 1)
    and exists (
      select 1 from public.players p
       where p.id = player_checkins.player_id
         and p.parent_id = auth.uid()
         and p.club_id = player_checkins.club_id
         and p.team_id = player_checkins.team_id
    )
  );

drop policy if exists checkins_staff_select on public.player_checkins;
create policy checkins_staff_select on public.player_checkins
  for select
  using (club_id in (select public.get_staff_club_ids()));

drop policy if exists checkins_staff_delete on public.player_checkins;
create policy checkins_staff_delete on public.player_checkins
  for delete
  using (club_id in (select public.get_staff_club_ids()));

comment on table public.player_checkins is
  'Daily player wellness + availability check-in. One row per player per team-local day. Note is private to the player and staff.';
comment on column public.player_checkins.checkin_date is
  'The TEAM''s local calendar day (clubs.timezone), computed server-side.';
comment on column public.player_checkins.soreness is
  '1 = fresh, 5 = very sore (inverted relative to sleep and energy).';


-- ---------------------------------------------------------------------------
-- Reminder dedupe log
-- ---------------------------------------------------------------------------
--
-- The hourly cron (/api/cron/checkin-reminders) pushes the 8 AM reminder.
-- Vercel can invoke a cron more than once, so the route claims (club, day)
-- here with INSERT ... ON CONFLICT DO NOTHING before sending: only the
-- invocation that actually inserts the row sends the push. Service role only:
-- RLS is on with no policies, so no user can read or write it.

create table if not exists public.checkin_reminder_log (
  club_id        uuid not null references public.clubs(id) on delete cascade,
  reminder_date  date not null,
  sent_at        timestamptz not null default now(),
  recipients     int not null default 0,
  primary key (club_id, reminder_date)
);

alter table public.checkin_reminder_log enable row level security;

comment on table public.checkin_reminder_log is
  'One row per club per team-local day once the 8 AM check-in reminder has been claimed. Service role only.';
