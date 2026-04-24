-- ============================================================
-- 027_demo_seeds.sql — tracking table for demo-seeded rows
-- ============================================================
-- Every row inserted by seedDemoData() gets a pointer here so
-- clearDemoData() can reverse the seed with a single scan. row_id is
-- text (not uuid) so we can also track auth.users ids without a
-- cross-schema FK.
-- Writes only go through the service-role client from within the two
-- server actions; no INSERT/UPDATE/DELETE policies are defined on
-- purpose. DOCs can read their own club's pointers to compute the
-- button state, nothing more.

CREATE TABLE demo_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  row_table text NOT NULL,
  row_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_demo_seeds_club_id ON demo_seeds(club_id);

ALTER TABLE demo_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_seeds_doc_read ON demo_seeds FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM profiles
      WHERE user_id = auth.uid() AND role = 'doc'
    )
  );
