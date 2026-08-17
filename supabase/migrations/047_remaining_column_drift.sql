-- Schema drift, part two: columns that exist in production but were never
-- written into a migration.
--
-- Found by comparing all 253 live columns (via the schema PostgREST publishes)
-- against every migration file. Types, nullability and defaults below were read
-- from the live database, not assumed.
--
-- Every statement is idempotent, so this is a no-op against production and only
-- does real work when the schema is built from scratch. The NOT NULL column is
-- added nullable, backfilled, then constrained, so it is also safe to apply to
-- a table that already holds rows.
--
-- NOT covered here: club_files.mime_type and club_files.uploaded_at. Those two
-- turned up in the same scan, but the club_files TABLE is itself absent from
-- every migration, so there is nothing to alter — see the note at the bottom.

-- ── camp_registrations: guest (non-account) registration details ─────────────
-- All nullable, because a registration made by a signed-in parent leaves them
-- empty. Note guest_kid_age is text in production, not an integer.
alter table public.camp_registrations add column if not exists guest_parent_name  text;
alter table public.camp_registrations add column if not exists guest_parent_email text;
alter table public.camp_registrations add column if not exists guest_parent_phone text;
alter table public.camp_registrations add column if not exists guest_kid_name     text;
alter table public.camp_registrations add column if not exists guest_kid_age      text;

-- ── announcements ────────────────────────────────────────────────────────────
alter table public.announcements add column if not exists poll_enabled boolean;
alter table public.announcements alter column poll_enabled set default false;
update public.announcements set poll_enabled = false where poll_enabled is null;
alter table public.announcements alter column poll_enabled set not null;

-- ── camp_details ─────────────────────────────────────────────────────────────
-- app/camps/register/[code]/actions.ts looks this up with
-- .eq('registration_code', code.toUpperCase()).single(), and .single() errors
-- on more than one row, so the code assumes this is unique — exactly as
-- teams.invite_code does in migration 046.
--
-- Unlike invite_code, that could NOT be verified: camp_details is empty in
-- production, so there was no second row to test a duplicate against, and
-- probing it would have meant inserting rows into the live database. This
-- reproduces only what was actually observed — a plain nullable text column —
-- rather than inventing a constraint that may not exist. Worth settling once a
-- camp exists, especially as codes are generated as 'CAMP-' plus five random
-- digits with no retry on collision.
alter table public.camp_details add column if not exists registration_code text;

-- ── Still outstanding: two whole tables ──────────────────────────────────────
-- `club_files` (8 columns) and `announcement_responses` (7 columns) exist in
-- production but have no create-table statement in any migration, so a rebuilt
-- database lacks them entirely. They are deliberately NOT reconstructed here.
--
-- Both have row level security enabled and working in production —
-- announcement_responses holds 18 rows and an anonymous client reads 0 — and
-- policy definitions cannot be read through PostgREST. Creating the tables from
-- the column list alone would produce tables with no policies, and in Supabase
-- that is worse than leaving them absent: a missing table fails loudly on the
-- first query, whereas a table without RLS is silently readable by anyone
-- holding the anon key. Their real DDL, including policies and on-delete rules,
-- needs to come out of the database itself.
