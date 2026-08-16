-- 044_players_parent_id_nullable.sql
--
-- players.parent_id has been NOT NULL since migration 009, which makes a
-- player without a parent impossible to store.
--
-- That is wrong for two real cases:
--   * a college roster — the players are adults and have no parent in the
--     system at all
--   * an ordinary youth club — the DOC has the squad list on day one but not
--     every parent's email address yet
--
-- Found by importing the 30-player FAU men's soccer roster: the CSV mapped and
-- previewed cleanly ("1 new team, 30 new players, 0 parents") and then the
-- insert was rejected by the database with
--   null value in column "parent_id" of relation "players"
--   violates not-null constraint
--
-- Note the "unlinked" badge on the team page does NOT mean parent_id is null.
-- It means parent_id points at a user who is not a parent team_member of that
-- team (teams/[id]/page.tsx:49). Genuinely absent parents were never
-- representable.
--
-- Safe for RLS. Of the three policies on players:
--   players_doc_all    club_id IN get_doc_club_ids()   — club-scoped, unaffected
--   players_coach_read club_id IN get_user_club_ids()  — club-scoped, unaffected
--   players_parent_own parent_id = auth.uid()          — NULL = auth.uid() is
--                                                        NULL, never true, so a
--                                                        parentless player is
--                                                        simply owned by nobody
--
-- The foreign key to auth.users is kept; it just no longer requires a value.

alter table public.players
  alter column parent_id drop not null;

comment on column public.players.parent_id is
  'Owning parent, nullable. Null means nobody claims this player yet - normal for a college roster, and for a youth import where the parent email was not supplied. players_parent_own therefore does not match, which is intended.';
