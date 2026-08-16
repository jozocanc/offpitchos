-- 043_club_timezone.sql
--
-- Fixes times rendering in UTC until the page hydrates.
--
-- event-card.tsx:311 (and 62 other call sites across 20+ files) formats with
--   date.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })
-- and no timeZone option, so the result depends on the RUNTIME's zone. Vercel's
-- Node runtime is UTC and the browser is not, so server-rendered HTML and the
-- hydrated client disagree.
--
-- Observed in production on every load of /dashboard/schedule:
--   stored           2026-08-20 22:00:00+00
--   first paint      10:00 PM - 12:00 AM     (UTC, wrong)
--   after hydration  6:00 PM - 8:00 PM       (America/New_York, correct)
--   console          React error #418 - text content does not match server HTML
--
-- So a U10 practice reads as running to midnight for the whole hydration
-- window. On a slow phone that is long enough to act on, and a parent who
-- misreads a start time turns up at the wrong hour.
--
-- The fix is to format against an EXPLICIT timezone on both sides, so the
-- server and the client produce byte-identical output and the mismatch cannot
-- happen. That timezone has to come from somewhere, hence this column.
--
-- Why on clubs and not club_settings: club_settings is not guaranteed to
-- exist. There are 2 clubs and only 1 club_settings row, so anything reading
-- the timezone from there would need a fallback on every call and would still
-- be wrong for the club with no row. Every club has a clubs row by definition.
--
-- Default America/New_York rather than UTC: it matches the 11 call sites that
-- already hardcode America/New_York (camps registration, etc.), so existing
-- behaviour is preserved exactly for the current clubs rather than silently
-- shifting every displayed time by 4-5 hours on deploy.
--
-- NOT NULL so callers never have to handle an absent value. An IANA name is
-- not validated by a CHECK here because the list is data, not a constant, and
-- a CHECK against pg_timezone_names cannot be immutable. Validation belongs at
-- the write path when a timezone picker is added to settings.

alter table public.clubs
  add column if not exists timezone text not null default 'America/New_York';

comment on column public.clubs.timezone is
  'IANA timezone name used to format all dates and times for this club. Must be passed explicitly to every date formatter so server and client render identically; formatting without it reintroduces the UTC-until-hydration bug fixed in 043.';
