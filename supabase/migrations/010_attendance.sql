-- 010_attendance.sql — track player attendance at events

CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')) DEFAULT 'present',
  marked_by uuid NOT NULL REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, player_id)
);

CREATE INDEX idx_attendance_event_id ON attendance(event_id);
CREATE INDEX idx_attendance_player_id ON attendance(player_id);

-- RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- DOC and coaches can manage attendance for their club's events
CREATE POLICY attendance_staff_all ON attendance FOR ALL
  USING (event_id IN (
    SELECT e.id FROM events e WHERE e.club_id IN (SELECT get_user_club_ids())
  ));

-- Parents can view attendance for their children
CREATE POLICY attendance_parent_read ON attendance FOR SELECT
  USING (player_id IN (
    SELECT id FROM players WHERE parent_id = auth.uid()
  ));
