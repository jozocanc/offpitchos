-- Schema drift: teams.invite_code and teams.group_chat_link exist in production
-- but were never written into a migration.
--
-- 001_initial_schema.sql creates `teams` with five columns; production has nine.
-- Two of the extras (public_enabled, public_share_token) arrived in a later
-- migration. These two never did — they were applied straight to the database.
-- Rebuilding from migrations therefore produced a `teams` table with no
-- invite_code, which breaks the entire join-by-code flow: both
-- app/join/code/[code]/page.tsx and .../actions.ts filter on it, and
-- app/dashboard/teams/[id]/page.tsx renders it as the team's invite card.
--
-- Everything here is idempotent, so applying it to production is a no-op and it
-- only does real work when the schema is built from scratch.

alter table public.teams add column if not exists invite_code     text;
alter table public.teams add column if not exists group_chat_link text;

-- Both join-by-code lookups use .single(), which errors on more than one row,
-- so the code depends on this being unique. Production already enforces it
-- under exactly this name (verified against the live database), which is what
-- Postgres names a `unique` column constraint. Reusing the name keeps this a
-- no-op there. NULL is not compared by a unique constraint, so the teams
-- without a code are unaffected.
do $$
begin
  alter table public.teams add constraint teams_invite_code_key unique (invite_code);
exception
  when duplicate_table or duplicate_object then null;
end
$$;
