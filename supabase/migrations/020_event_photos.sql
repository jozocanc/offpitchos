-- ============================================================
-- 020_event_photos.sql — photo gallery attached to events
--
-- Team members (coaches + parents of the event's team) can view
-- and upload. Uploaders delete their own; coaches and DOC of the
-- team can delete any. Storage bucket is private; all access goes
-- through server actions using the service client.
-- ============================================================

CREATE TABLE event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  storage_path text NOT NULL UNIQUE,
  caption text,
  width integer,
  height integer,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_photos_event_id ON event_photos(event_id);
CREATE INDEX idx_event_photos_uploader ON event_photos(uploaded_by);

ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

-- Club members can read photos for events in their club.
CREATE POLICY event_photos_club_read ON event_photos FOR SELECT
  USING (event_id IN (
    SELECT e.id FROM events e WHERE e.club_id IN (SELECT get_user_club_ids())
  ));

-- Club members can insert photos for their club's events.
CREATE POLICY event_photos_club_insert ON event_photos FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND event_id IN (
      SELECT e.id FROM events e WHERE e.club_id IN (SELECT get_user_club_ids())
    )
  );

-- Uploader can delete own photo.
CREATE POLICY event_photos_uploader_delete ON event_photos FOR DELETE
  USING (uploaded_by = auth.uid());

-- DOC of the event's club can delete any photo in their club.
CREATE POLICY event_photos_doc_delete ON event_photos FOR DELETE
  USING (event_id IN (
    SELECT e.id FROM events e WHERE e.club_id IN (SELECT get_doc_club_ids())
  ));

-- Create the private storage bucket for event photos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', false)
ON CONFLICT (id) DO NOTHING;
