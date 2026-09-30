-- 055_match_sheets.sql
--
-- "Visiting team info" match-day sheet for HOME games.
--
-- WHY
--
-- Before every home fixture the home staff text the visiting coach the same
-- five things: when to arrive, where to park, which locker room, what colors
-- we wear, and who to call. This gives each home game one public, no-login
-- page holding those answers. The link is the credential: a random uuid token,
-- rotated only by deleting and recreating the sheet.
--
-- One sheet per event, so event_id is the primary key. Deleting the event
-- deletes the sheet.
--
-- ACCESS
--
--   Staff (head coach + coaches) of the club: full CRUD through RLS.
--   Everyone else, including anon: NO table access at all. The public page
--   reads through get_match_sheet(token), a SECURITY DEFINER function that
--   returns a fixed, safe set of columns and only while enabled = true.

create table if not exists public.match_sheets (
  event_id      uuid primary key references public.events(id) on delete cascade,
  club_id       uuid not null references public.clubs(id) on delete cascade,
  token         uuid not null unique default gen_random_uuid(),
  arrival_notes text,
  parking       text,
  locker_room   text,
  home_kit      text,
  contact_name  text,
  contact_phone text,
  extra_notes   text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists match_sheets_club_id_idx on public.match_sheets (club_id);

-- Dropped first so the migration can be re-run safely from the SQL editor.
alter table public.match_sheets drop constraint if exists match_sheets_text_lengths;
alter table public.match_sheets add constraint match_sheets_text_lengths
  check (
    (arrival_notes is null or char_length(arrival_notes) <= 1000)
    and (parking is null or char_length(parking) <= 1000)
    and (locker_room is null or char_length(locker_room) <= 500)
    and (home_kit is null or char_length(home_kit) <= 200)
    and (contact_name is null or char_length(contact_name) <= 100)
    and (contact_phone is null or char_length(contact_phone) <= 40)
    and (extra_notes is null or char_length(extra_notes) <= 2000)
  );

drop trigger if exists match_sheets_updated_at on public.match_sheets;
create trigger match_sheets_updated_at
  before update on public.match_sheets
  for each row execute function public.update_updated_at();

alter table public.match_sheets enable row level security;

-- Staff of the club: read / write. The insert/update check also pins club_id
-- to the event's own club, so a coach cannot attach a sheet for their club to
-- another club's event (or relabel one).
drop policy if exists match_sheets_staff_select on public.match_sheets;
create policy match_sheets_staff_select on public.match_sheets
  for select
  using (
    club_id in (select public.get_staff_club_ids())
    or club_id in (select public.get_doc_club_ids())
  );

drop policy if exists match_sheets_staff_insert on public.match_sheets;
create policy match_sheets_staff_insert on public.match_sheets
  for insert
  with check (
    (
      club_id in (select public.get_staff_club_ids())
      or club_id in (select public.get_doc_club_ids())
    )
    and exists (
      select 1 from public.events e
       where e.id = match_sheets.event_id
         and e.club_id = match_sheets.club_id
    )
  );

drop policy if exists match_sheets_staff_update on public.match_sheets;
create policy match_sheets_staff_update on public.match_sheets
  for update
  using (
    club_id in (select public.get_staff_club_ids())
    or club_id in (select public.get_doc_club_ids())
  )
  with check (
    (
      club_id in (select public.get_staff_club_ids())
      or club_id in (select public.get_doc_club_ids())
    )
    and exists (
      select 1 from public.events e
       where e.id = match_sheets.event_id
         and e.club_id = match_sheets.club_id
    )
  );

drop policy if exists match_sheets_staff_delete on public.match_sheets;
create policy match_sheets_staff_delete on public.match_sheets
  for delete
  using (
    club_id in (select public.get_staff_club_ids())
    or club_id in (select public.get_doc_club_ids())
  );

-- No anon grants on the table. RLS already blocks anon (no policy matches),
-- and revoking makes the intent explicit.
revoke all on public.match_sheets from anon;

comment on table public.match_sheets is
  'Public match-day info for the visiting team of a home game. Read publicly only via get_match_sheet(token).';
comment on column public.match_sheets.token is
  'Share token in /match/{token}. The link is the credential.';
comment on column public.match_sheets.home_kit is
  'Home team colors, so the visitors bring a contrasting kit.';
comment on column public.match_sheets.enabled is
  'false = link switched off; get_match_sheet returns nothing.';


-- ---------------------------------------------------------------------------
-- Public read
-- ---------------------------------------------------------------------------
--
-- Returns one row for an enabled sheet, nothing otherwise (unknown token,
-- disabled sheet). Only event logistics and the sheet itself: no roster, no
-- member data, no ids beyond what the page needs.

create or replace function public.get_match_sheet(p_token uuid)
returns table (
  event_title   text,
  event_type    text,
  event_status  text,
  start_time    timestamptz,
  end_time      timestamptz,
  venue_name    text,
  venue_address text,
  event_address text,
  team_name     text,
  club_name     text,
  club_timezone text,
  arrival_notes text,
  parking       text,
  locker_room   text,
  home_kit      text,
  contact_name  text,
  contact_phone text,
  extra_notes   text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    e.title,
    e.type,
    e.status,
    e.start_time,
    e.end_time,
    v.name,
    v.address,
    e.address,
    t.name,
    c.name,
    c.timezone,
    ms.arrival_notes,
    ms.parking,
    ms.locker_room,
    ms.home_kit,
    ms.contact_name,
    ms.contact_phone,
    ms.extra_notes
  from public.match_sheets ms
  join public.events e on e.id = ms.event_id
  join public.teams  t on t.id = e.team_id
  join public.clubs  c on c.id = ms.club_id
  left join public.venues v on v.id = e.venue_id
  where ms.token = p_token
    and ms.enabled = true
  limit 1;
$$;

revoke all on function public.get_match_sheet(uuid) from public;
grant execute on function public.get_match_sheet(uuid) to anon, authenticated;
