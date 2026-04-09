-- ============================================================
-- 017_gear_size_requests.sql — track when the DOC last
-- requested gear sizes from parents, so we can show
-- "last requested X ago" and "N of M parents responded".
-- ============================================================

ALTER TABLE club_settings
  ADD COLUMN IF NOT EXISTS last_gear_size_request_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_gear_size_request_parent_count integer;
