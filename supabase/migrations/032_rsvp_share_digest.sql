-- 032_rsvp_share_digest.sql
--
-- Adds three independent capabilities so the schema work lands in one
-- migration instead of three churn-y ones:
--
-- 1. event_rsvps     — parent-driven "we'll be there" / "can't make it"
--                      forecasts per child. Separate from attendance so
--                      a parent RSVP never overwrites a coach's mark.
-- 2. teams.public_*  — opt-in share token so a DOC can publish a team's
--                      roster + schedule at a no-auth URL.
-- 3. weekly_digests  — persisted Sunday-night AI summaries per club so
--                      we can render history and re-send without a re-gen.

-- ============================================================
-- 1) event_rsvps
-- ============================================================

CREATE TABLE event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('going', 'not_going')),
  responded_by uuid NOT NULL REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);

CREATE INDEX idx_event_rsvps_event_id ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_player_id ON event_rsvps(player_id);
CREATE INDEX idx_event_rsvps_event_response ON event_rsvps(event_id, response);

CREATE TRIGGER event_rsvps_updated_at
  BEFORE UPDATE ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Parents manage RSVPs for their own kids only.
CREATE POLICY rsvps_parent_all ON event_rsvps FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE parent_id = auth.uid()))
  WITH CHECK (player_id IN (SELECT id FROM players WHERE parent_id = auth.uid()));

-- Staff (DOC + coach) can read all RSVPs for events in their club.
CREATE POLICY rsvps_staff_read ON event_rsvps FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e WHERE e.club_id IN (SELECT get_user_club_ids())
    )
  );

-- ============================================================
-- 2) Public team share
-- ============================================================

ALTER TABLE teams
  ADD COLUMN public_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN public_share_token uuid UNIQUE;

CREATE INDEX idx_teams_public_share_token ON teams(public_share_token)
  WHERE public_share_token IS NOT NULL;

-- SECURITY DEFINER lookup that bypasses RLS *only* for share-token
-- access. Returns nothing unless the team has explicitly enabled
-- public sharing — i.e. a stale token after the DOC turns sharing
-- back off becomes inert immediately.
-- Column names below are aliased away from `position` and `type` because
-- those would collide with reserved words inside RETURNS TABLE clauses.
CREATE OR REPLACE FUNCTION get_public_team_by_token(token_input uuid)
RETURNS TABLE (
  team_id uuid,
  club_id uuid,
  team_name text,
  age_group text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT t.id, t.club_id, t.name, t.age_group
  FROM teams t
  WHERE t.public_share_token = token_input
    AND t.public_enabled = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_public_team_roster(team_id_input uuid)
RETURNS TABLE (
  player_id uuid,
  first_name text,
  last_name text,
  jersey_number int,
  player_position text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.id, p.first_name, p.last_name, p.jersey_number, p.position
  FROM players p
  JOIN teams t ON t.id = p.team_id
  WHERE p.team_id = team_id_input
    AND t.public_enabled = true
  ORDER BY p.jersey_number NULLS LAST, p.last_name;
$$;

CREATE OR REPLACE FUNCTION get_public_team_schedule(team_id_input uuid, days_ahead int)
RETURNS TABLE (
  event_id uuid,
  event_type text,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  venue_name text,
  venue_address text,
  event_address text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT e.id, e.type, e.title, e.start_time, e.end_time, e.status,
         v.name AS venue_name,
         v.address AS venue_address,
         e.address AS event_address
  FROM events e
  LEFT JOIN venues v ON v.id = e.venue_id
  JOIN teams t ON t.id = e.team_id
  WHERE e.team_id = team_id_input
    AND t.public_enabled = true
    AND e.start_time >= now() - interval '7 days'
    AND e.start_time <= now() + (days_ahead || ' days')::interval
  ORDER BY e.start_time ASC;
$$;

-- ============================================================
-- 3) weekly_digests
-- ============================================================

CREATE TABLE weekly_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  summary_md text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES auth.users(id),
  emailed_at timestamptz,
  email_recipients int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, week_start)
);

CREATE INDEX idx_weekly_digests_club_week ON weekly_digests(club_id, week_start DESC);

ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;

-- Anyone in the club can read the digest (parents care most).
CREATE POLICY digests_member_read ON weekly_digests FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));

-- Only the DOC can manage digests; service role does the actual writes.
CREATE POLICY digests_doc_all ON weekly_digests FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));
