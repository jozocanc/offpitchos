-- ============================================================
-- 022_event_link.sql — optional external link on an event
--
-- Lets DOC/coach paste a tournament registration URL or similar
-- on an event so parents can tap through to the official site.
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS link text;
