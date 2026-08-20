-- Squad self-collection.
--
-- The gear request only ever reached players through `parent_id`, so at a
-- college program (zero parents, see the club_type discovery answers) the
-- "Request sizes from parents" button notified nobody and the roster sat at
-- 0/30 sizes forever. Rob collects this in a spreadsheet instead, twice: once
-- for kit, once for travel.
--
-- This gives every player a private link they can fill in with no account.
-- Requiring 30 student-athletes to sign up is how the response rate dies and
-- the spreadsheet comes back.
--
-- No RLS policy is added on purpose. The collect page reads and writes
-- server-side with the service client after validating the token itself, the
-- same shape /join/code uses, so anon gains no direct access to `players`.

alter table players
  add column if not exists collect_token uuid not null default gen_random_uuid(),
  add column if not exists collected_at timestamptz,
  add column if not exists address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists dietary_notes text;

-- The token is the only credential on a public page, so it must be unguessable
-- and unique. The unique index is also the lookup path for /collect/<token>.
create unique index if not exists players_collect_token_key
  on players (collect_token);

comment on column players.collect_token is
  'Bearer token for the public /collect/<token> form. Whoever holds it can read and update that one player row, so share it per player, never in a group thread.';

-- Deliberately NOT stored: passport numbers and dates of birth beyond the
-- existing date_of_birth column. Rob collects passports for travel, but a
-- passport store for 30 student-athletes is breach liability and almost
-- certainly needs the written agreement with FAU compliance that does not
-- exist yet. Kit, address and emergency contact carry none of that weight.
