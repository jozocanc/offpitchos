-- 056: indexes for hot dashboard filters that had no matching index.
-- Additive only: no table, column, policy or data changes. Safe to re-run.

-- Dashboard, schedule and the head coach's attention list all filter events
-- by club and a start_time window, ordered by start_time. Only single-column
-- indexes existed (club_id, start_time), so Postgres had to pick one and
-- filter the rest.
create index if not exists idx_events_club_start
  on public.events (club_id, start_time);

-- Messages read receipts: notifications filtered by announcement_id (plus
-- type). announcement_id (008) was never indexed, so every Messages load
-- scanned the notifications table, the fastest-growing table in the app.
create index if not exists idx_notifications_announcement
  on public.notifications (announcement_id)
  where announcement_id is not null;

-- Readiness board: a team's check-ins over a date range. 054 indexed
-- (club_id, checkin_date) and (player_id, checkin_date), not team_id.
create index if not exists idx_player_checkins_team_date
  on public.player_checkins (team_id, checkin_date);

-- Staff page: events a coach created in the last 30 days, and attendance a
-- coach marked. Neither query has a club filter, so without these they scan
-- the whole table across every club.
create index if not exists idx_events_created_by_start
  on public.events (created_by, start_time);

create index if not exists idx_attendance_marked_by
  on public.attendance (marked_by);
