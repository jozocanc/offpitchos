-- ============================================================
-- 031_team_members_invite_insert_definer.sql
-- ============================================================
-- Round 4 of the /join/<token> accept saga:
--   029 — direct auth.users subquery         → "permission denied for table users"
--   030 — swap to auth.jwt()->>'email'       → fixed auth.users; broke on invites RLS
--   031 — SECURITY DEFINER helper            → bypasses invites RLS for this narrow predicate
--
-- The policy needs to check "does a matching pending invite exist?"
-- but the authenticated role can't read the invites table (no SELECT
-- policy for non-DOCs). A SECURITY DEFINER function runs as its owner
-- (postgres) and can see every invite — but it only returns a boolean
-- so no invite data leaks to the caller. Function is locked down to
-- the authenticated role only and hard-pins search_path to defeat
-- temp-schema shadowing attacks.

CREATE OR REPLACE FUNCTION public.has_valid_pending_invite(
  p_team_id uuid,
  p_role    text,
  p_email   text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM invites i
    WHERE i.team_id    = p_team_id
      AND i.role       = p_role
      AND i.status     = 'pending'
      AND i.expires_at > now()
      AND (i.email IS NULL OR i.email = p_email)
  );
$fn$;

-- Lock down execution: signed-in callers only, not anon or public.
REVOKE ALL ON FUNCTION public.has_valid_pending_invite(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_valid_pending_invite(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_valid_pending_invite(uuid, text, text) TO authenticated;

-- Replace the broken 030 policy with one that calls the helper.
DROP POLICY IF EXISTS team_members_invite_insert ON team_members;

CREATE POLICY team_members_invite_insert ON team_members
  FOR INSERT
  WITH CHECK (
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND
    public.has_valid_pending_invite(
      team_members.team_id,
      team_members.role,
      auth.jwt() ->> 'email'
    )
  );
