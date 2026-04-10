-- 019_player_scoped_invites.sql
--
-- Lets a DOC generate a targeted "you're the parent of Billy Smith" invite
-- link. On accept, the acceptInvite action auto-claims the target player
-- for the arriving parent — turning the team-scoped fallback (which always
-- required a manual "claim your kids" step on the dashboard) into an
-- automatic, deterministic match.
--
-- player_id is nullable: existing team-scoped invites keep working
-- unchanged. The RPC is updated to return the new column so the
-- unauthenticated join page can look it up before the user signs in.

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES players(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_invites_player_id ON invites(player_id);

-- Regenerate the RPC with the new column in the return type. We have to
-- DROP first because Postgres won't let CREATE OR REPLACE change the
-- declared return shape of an existing function. Keeping the same
-- SECURITY DEFINER + pending/expires filter so the join page continues
-- to work unauthenticated.
DROP FUNCTION IF EXISTS get_invite_by_token(uuid);

CREATE FUNCTION get_invite_by_token(invite_token uuid)
RETURNS TABLE (
  id uuid,
  club_id uuid,
  team_id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  player_id uuid
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, club_id, team_id, email, role, status, expires_at, player_id
  FROM invites
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
$$;
