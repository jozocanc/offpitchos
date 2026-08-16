-- 039_pin_function_search_path.sql
--
-- Twelve functions predate the search_path convention that migrations 033-037
-- follow. Nine of them are SECURITY DEFINER, which is the combination that
-- matters: the body runs with the owner's privileges (postgres) while name
-- resolution follows the CALLER's search_path.
--
-- Every one of these resolves its tables unqualified — `teams`, `clubs`,
-- `invites`, `players`, `events`, `venues`, `profiles`, `drill_versions`.
-- Anyone able to create an object in a schema that sorts earlier in the
-- caller's search_path can therefore shadow those names and have their own
-- table read, or their own function executed, as the definer.
--
-- get_doc_club_ids() and get_user_team_ids() are the sharpest examples: they
-- decide DOC authority and team membership, and 23 RLS policies across 18
-- tables are built on top of them. Shadowing `clubs` there rewrites who counts
-- as a Director of Coaching.
--
-- ALTER FUNCTION ... SET search_path is used rather than CREATE OR REPLACE so
-- the bodies are not restated here and cannot drift from what is live.
--
-- pg_temp is named explicitly and placed LAST. It is otherwise searched first
-- implicitly, which is the actual attack surface — a temp table named `clubs`
-- would win over the real one.
--
-- Checked before applying: no body references an extension function, so
-- narrowing the path to public + pg_temp cannot break resolution. auth.uid()
-- is already schema-qualified and now() lives in pg_catalog, which is always
-- searched first regardless.
--
-- The three trigger functions are SECURITY INVOKER and therefore much lower
-- risk, but they are pinned too so the lint reports clean and the convention
-- is uniform.

-- SECURITY DEFINER — the ones that actually matter
alter function public.get_doc_club_ids()                       set search_path = public, pg_temp;
alter function public.get_doc_team_ids()                       set search_path = public, pg_temp;
alter function public.get_user_club_ids()                      set search_path = public, pg_temp;
alter function public.get_user_team_ids()                      set search_path = public, pg_temp;
alter function public.get_user_profile_ids()                   set search_path = public, pg_temp;
alter function public.get_invite_by_token(uuid)                set search_path = public, pg_temp;
alter function public.get_public_team_by_token(uuid)           set search_path = public, pg_temp;
alter function public.get_public_team_roster(uuid)             set search_path = public, pg_temp;
alter function public.get_public_team_schedule(uuid, integer)  set search_path = public, pg_temp;

-- SECURITY INVOKER trigger functions — hygiene, not exposure
alter function public.update_updated_at()                      set search_path = public, pg_temp;
alter function public.touch_drills_updated_at()                set search_path = public, pg_temp;
alter function public.trim_drill_versions()                    set search_path = public, pg_temp;
