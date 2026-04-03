-- ============================================================
-- 006_scheduling.sql — venues, events, notifications
-- ============================================================

-- --------------------------------------------------------
-- TABLES
-- --------------------------------------------------------

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('practice', 'game', 'tournament', 'camp', 'tryout', 'meeting', 'custom')),
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  recurrence_group uuid,
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_end_after_start CHECK (end_time > start_time)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('event_created', 'event_updated', 'event_cancelled')),
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------

CREATE INDEX idx_venues_club_id ON venues(club_id);

CREATE INDEX idx_events_club_id ON events(club_id);
CREATE INDEX idx_events_team_start ON events(team_id, start_time);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_recurrence_group ON events(recurrence_group) WHERE recurrence_group IS NOT NULL;
CREATE INDEX idx_events_status ON events(status);

CREATE INDEX idx_notifications_profile_id ON notifications(profile_id);
CREATE INDEX idx_notifications_unread ON notifications(profile_id, read) WHERE read = false;
CREATE INDEX idx_notifications_event_id ON notifications(event_id);

-- --------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------
-- RLS
-- --------------------------------------------------------

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- venues: DOC full CRUD
CREATE POLICY venues_doc_all ON venues FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- venues: all club members read
CREATE POLICY venues_member_read ON venues FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));

-- events: DOC full CRUD for their club
CREATE POLICY events_doc_all ON events FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- events: coach CRUD for their teams (non-DOC only)
CREATE POLICY events_coach_all ON events FOR ALL
  USING (
    team_id IN (SELECT get_user_team_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
  )
  WITH CHECK (
    team_id IN (SELECT get_user_team_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
  );

-- events: all team members can read their team's events
CREATE POLICY events_member_read ON events FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));

-- notifications: users read their own
CREATE POLICY notifications_own_read ON notifications FOR SELECT
  USING (profile_id IN (SELECT get_user_profile_ids()));

-- notifications: users update their own (mark read)
CREATE POLICY notifications_own_update ON notifications FOR UPDATE
  USING (profile_id IN (SELECT get_user_profile_ids()))
  WITH CHECK (profile_id IN (SELECT get_user_profile_ids()));

-- notifications: insert via service role only (no user INSERT policy)
