-- 009_players.sql — player profiles (children of parents)

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  jersey_number int,
  position text,
  date_of_birth date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_players_team_id ON players(team_id);
CREATE INDEX idx_players_parent_id ON players(parent_id);
CREATE INDEX idx_players_club_id ON players(club_id);

-- Trigger for updated_at
CREATE TRIGGER players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- DOC can see all players in their club
CREATE POLICY players_doc_all ON players FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()));

-- Coaches can see players on their teams
CREATE POLICY players_coach_read ON players FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));

-- Parents can manage their own children
CREATE POLICY players_parent_own ON players FOR ALL
  USING (parent_id = auth.uid());
