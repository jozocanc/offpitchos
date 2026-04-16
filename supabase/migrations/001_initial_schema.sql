-- OffPitchOS Initial Schema
-- Tables: clubs, teams, profiles, team_members, invites
-- Includes: constraints, triggers, RLS policies

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  age_group text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('doc', 'coach', 'parent')),
  display_name text NOT NULL DEFAULT '',
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('coach', 'parent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, profile_id)
);

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  email text,
  role text NOT NULL CHECK (role IN ('coach', 'parent')),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_teams_club_id ON teams(club_id);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_club_id ON profiles(club_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_profile_id ON team_members(profile_id);
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_club_id ON invites(club_id);
CREATE INDEX idx_invites_email ON invites(email);

-- ============================================
-- TRIGGERS: auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RPC FUNCTION: secure invite lookup by token
-- ============================================

CREATE OR REPLACE FUNCTION get_invite_by_token(invite_token uuid)
RETURNS TABLE (
  id uuid,
  club_id uuid,
  team_id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, club_id, team_id, email, role, status, expires_at
  FROM invites
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
$$;

-- ============================================
-- ROW-LEVEL SECURITY
-- ============================================

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- --- CLUBS ---

CREATE POLICY clubs_doc_all ON clubs
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY clubs_members_read ON clubs
  FOR SELECT
  USING (
    id IN (SELECT club_id FROM profiles WHERE user_id = auth.uid())
  );

-- --- TEAMS ---

CREATE POLICY teams_doc_all ON teams
  FOR ALL
  USING (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  )
  WITH CHECK (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );

CREATE POLICY teams_members_read ON teams
  FOR SELECT
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );

-- --- PROFILES ---

CREATE POLICY profiles_own_read ON profiles
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY profiles_own_update ON profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY profiles_own_insert ON profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY profiles_doc_read ON profiles
  FOR SELECT
  USING (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );

-- --- TEAM_MEMBERS ---

CREATE POLICY team_members_doc_all ON team_members
  FOR ALL
  USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN clubs c ON t.club_id = c.id
      WHERE c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN clubs c ON t.club_id = c.id
      WHERE c.created_by = auth.uid()
    )
  );

CREATE POLICY team_members_own_read ON team_members
  FOR SELECT
  USING (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- --- INVITES ---

CREATE POLICY invites_doc_all ON invites
  FOR ALL
  USING (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  )
  WITH CHECK (
    club_id IN (SELECT id FROM clubs WHERE created_by = auth.uid())
  );
