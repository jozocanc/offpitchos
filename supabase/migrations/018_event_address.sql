-- ============================================================
-- 018_event_address.sql — per-event address override
-- When a DOC moves an event to a one-off location that isn't
-- a permanent venue, they can type the address directly on the
-- event itself. Falls back to venues.address when empty.
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS address text;
