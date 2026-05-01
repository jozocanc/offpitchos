-- ============================================================
-- 029_team_members_invite_insert.sql — let a signed-in user
-- add themselves to a team IFF a matching pending invite exists.
-- ============================================================
--
-- Root cause (caught on prod test14 → parent1 accept flow):
-- the only existing INSERT policy on team_members is the
-- DOC-all policy, so acceptInvite's own-client upsert hit
-- default-deny and Postgres threw "new row violates row-level
-- security policy for table team_members". Today's seeded test
-- accounts all got their rows via service-role in
-- seedDemoData, which bypasses RLS, so this was never
-- exercised until a real /join/<token> accept happened.
--
-- Fix: a narrow INSERT policy that succeeds only when the new
-- row exactly matches a still-valid pending invite the caller
-- owns by email or holds a team-scoped token for. No code
-- change needed in acceptInvite — the order of operations
-- there (team_members insert BEFORE invites status flip) means
-- the policy's `status = 'pending'` predicate evaluates at the
-- correct moment.
--
-- =========================== KNOWN LIMIT =====================
-- Team-scoped invites (email IS NULL) rely on the invite token
-- UUID being a bearer credential. A signed-in user who learns
-- the team_id through any other channel could self-insert IF a
-- team-scoped invite exists on that team — they wouldn't need
-- the URL, just the team_id. Future hardening options:
--   (a) require addressed invites only (break today's
--       "Get parent invite link" share-the-URL flow);
--   (b) require the caller to have visited /join/<token> in
--       the current session (hard to enforce at the DB layer —
--       would need a server-side token-binding step that
--       stamps something on auth.users or a session row the
--       policy can read).
-- Preserving bearer-URL semantics for now to match the product
-- behavior of "DOC copies the link and sends it however";
-- revisit when the email-invite flow (Option A) ships and the
-- share-the-URL path is deprecated.
-- =============================================================

CREATE POLICY team_members_invite_insert ON team_members
  FOR INSERT
  WITH CHECK (
    -- 1) The row's profile_id must belong to the caller.
    profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND
    -- 2) A matching pending invite must exist for THIS team,
    --    THIS role, and either (a) emailed to the caller, or
    --    (b) team-scoped (email IS NULL, bearer-URL semantics).
    EXISTS (
      SELECT 1 FROM invites i
      WHERE i.team_id = team_members.team_id
        AND i.role = team_members.role
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND (
          i.email IS NULL
          OR i.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    )
  );
