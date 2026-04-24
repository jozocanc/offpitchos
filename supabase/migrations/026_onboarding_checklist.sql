-- ============================================================
-- 026_onboarding_checklist.sql — dismiss flag for the post-wizard checklist
-- ============================================================
-- Adds a per-club timestamp recording when the DOC dismissed the
-- onboarding checklist on the dashboard. Null means still visible.
-- Auto-completion of the four steps is derived from live data
-- (teams / team_members / events counts) and does not need its own
-- column — only the dismiss state has to persist.

ALTER TABLE club_settings
  ADD COLUMN onboarding_dismissed_at timestamptz;
