-- ============================================================
-- 021_direct_messages.sql — 1:1 direct messages between users
--
-- Parent ↔ coach on the same team, or DOC ↔ anyone in their club.
-- No parent↔parent. Authorization is enforced in the server action
-- because the rules span multiple tables; RLS here only guarantees
-- you can't read or modify messages that aren't yours.
-- ============================================================

CREATE TABLE direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

-- Thread queries: "all messages between me and X, newest first".
CREATE INDEX idx_dm_sender_recipient ON direct_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_dm_recipient_sender ON direct_messages(recipient_id, sender_id, created_at DESC);
CREATE INDEX idx_dm_unread ON direct_messages(recipient_id, read_at) WHERE read_at IS NULL;

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- You can read messages where you are sender or recipient.
CREATE POLICY dm_participant_read ON direct_messages FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- You can insert a message only as yourself.
CREATE POLICY dm_sender_insert ON direct_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Recipient can update read_at (to mark as read).
CREATE POLICY dm_recipient_update ON direct_messages FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Sender can delete their own message (unsend).
CREATE POLICY dm_sender_delete ON direct_messages FOR DELETE
  USING (sender_id = auth.uid());
