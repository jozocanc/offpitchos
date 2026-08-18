-- The two tables that existed in production but in no migration:
-- club_files and announcement_responses. A database rebuilt from this
-- directory had neither, so Files and announcement RSVPs were broken from the
-- first query.
--
-- Everything below was read out of the live database (pg_constraint,
-- pg_policies, pg_indexes, pg_trigger and the schema PostgREST publishes)
-- rather than inferred from the application code. Constraint names are left to
-- Postgres because the production names are exactly the ones it generates, so a
-- rebuilt database matches down to the identifiers.
--
-- Idempotent throughout: a no-op against production, real work on a fresh
-- build. The policies in particular are created inside exception guards rather
-- than dropped and recreated, so this can never briefly remove a live policy.

-- ── announcement_responses ───────────────────────────────────────────────────
create table if not exists public.announcement_responses (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  response        text not null check (response = any (array['yes'::text, 'no'::text, 'maybe'::text])),
  -- no on-delete rule on this one in production, unlike the two above
  responded_by    uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (announcement_id, player_id)
);

create index if not exists announcement_responses_announcement_idx
  on public.announcement_responses using btree (announcement_id);

alter table public.announcement_responses enable row level security;

-- Anyone in the club can read responses to that club's announcements.
do $$
begin
  create policy announcement_responses_club_read on public.announcement_responses
    for select
    using (announcement_id in (
      select announcements.id from public.announcements
      where announcements.club_id in (select get_user_club_ids())
    ));
exception when duplicate_object then null;
end $$;

-- A parent may answer only for their own child, and only as themselves.
do $$
begin
  create policy announcement_responses_parent_insert on public.announcement_responses
    for insert
    with check (
      player_id in (select players.id from public.players where players.parent_id = auth.uid())
      and responded_by = auth.uid()
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy announcement_responses_parent_update on public.announcement_responses
    for update
    using (player_id in (select players.id from public.players where players.parent_id = auth.uid()))
    with check (
      player_id in (select players.id from public.players where players.parent_id = auth.uid())
      and responded_by = auth.uid()
    );
exception when duplicate_object then null;
end $$;

-- ── club_files ───────────────────────────────────────────────────────────────
create table if not exists public.club_files (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  name         text not null,
  storage_path text not null unique,
  size_bytes   bigint not null,
  mime_type    text not null,
  uploaded_by  uuid not null references auth.users(id),
  uploaded_at  timestamptz not null default now()
);

create index if not exists club_files_club_uploaded_idx
  on public.club_files using btree (club_id, uploaded_at desc);

alter table public.club_files enable row level security;

-- Everyone in the club reads; only a DOC uploads or deletes. Production has no
-- UPDATE policy on this table, so neither does this — files are replaced by
-- delete-then-upload rather than edited in place.
do $$
begin
  create policy club_files_member_read on public.club_files
    for select using (club_id in (select get_user_club_ids()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy club_files_doc_insert on public.club_files
    for insert with check (club_id in (select get_doc_club_ids()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy club_files_doc_delete on public.club_files
    for delete using (club_id in (select get_doc_club_ids()));
exception when duplicate_object then null;
end $$;
