-- 052_event_travel.sql
--
-- Travel details for away games and tournaments, plus two travel-readiness
-- answers on the squad self-collect form.
--
-- WHY
--
-- College staff run away trips out of a spreadsheet and a group chat: bus
-- time, pickup spot, hotel, meal stops, dress code, what to bring. Every one
-- of those answers belongs to exactly one event, so it lives on the event row
-- rather than in a new trips table. One trip per event covers an away game
-- and a weekend tournament alike. If a multi-leg itinerary ever becomes a
-- real ask, that is the moment for a table, not before.
--
-- RLS: NO CHANGE NEEDED
--
-- These are plain columns on public.events, so they inherit the existing
-- policies exactly:
--   events_member_read  (006)  FOR SELECT, team_id in get_user_team_ids()
--                              -> every rostered player and coach reads the
--                                 trip for their own team's events.
--   events_coach_all    (038)  FOR ALL, team member AND club staff
--   events_doc_all      (006)  FOR ALL, club owner
--                              -> only staff can write travel details.
-- Parents / players cannot write, per the 038 fix.
--
-- ALL COLUMNS ARE NULLABLE. An event with no travel details is simply a home
-- event; nothing backfills.

alter table public.events
  add column if not exists travel_depart_at       timestamptz,
  add column if not exists travel_depart_location text,
  add column if not exists travel_return_at       timestamptz,
  add column if not exists travel_mode            text,
  add column if not exists travel_hotel           text,
  add column if not exists travel_notes           text;

-- Constraints are added separately (and dropped first) so the migration can
-- be re-run safely from the SQL editor.
alter table public.events drop constraint if exists events_travel_mode_check;
alter table public.events add constraint events_travel_mode_check
  check (travel_mode is null or travel_mode in ('bus', 'van', 'flight', 'cars', 'other'));

-- The server action validates this too. The constraint is the backstop for
-- anything that writes through PostgREST directly.
alter table public.events drop constraint if exists events_travel_return_after_depart;
alter table public.events add constraint events_travel_return_after_depart
  check (
    travel_depart_at is null
    or travel_return_at is null
    or travel_return_at > travel_depart_at
  );

alter table public.events drop constraint if exists events_travel_text_lengths;
alter table public.events add constraint events_travel_text_lengths
  check (
    (travel_depart_location is null or char_length(travel_depart_location) <= 200)
    and (travel_hotel is null or char_length(travel_hotel) <= 200)
    and (travel_notes is null or char_length(travel_notes) <= 4000)
  );

comment on column public.events.travel_depart_at is
  'When the team leaves for this event (bus/van/flight departure). Null = no travel planned.';
comment on column public.events.travel_depart_location is
  'Where the team meets to leave, e.g. "Wagstaff Gym parking lot".';
comment on column public.events.travel_return_at is
  'Estimated return time. Must be after travel_depart_at when both are set.';
comment on column public.events.travel_mode is
  'bus | van | flight | cars | other.';
comment on column public.events.travel_hotel is
  'Hotel name (and optionally address) for overnight trips.';
comment on column public.events.travel_notes is
  'Free-text itinerary: meal stops, dress code, what to bring.';


-- ---------------------------------------------------------------------------
-- Travel readiness on the self-collect form (049)
-- ---------------------------------------------------------------------------
--
-- 049 deliberately did NOT store passport numbers, and this keeps that line.
-- What staff actually need before booking a flight is two yes/no questions:
-- does this athlete have ID that will get them through TSA, and is their
-- passport (if any) going to be valid on the travel date. An expiry DATE
-- answers the second without holding the document number, which is the part
-- that carries breach liability.
--
-- Same access path as the rest of 049: written server-side by the tokenised
-- /collect page via the service client, read by staff through the existing
-- players policies. No policy change.

alter table public.players
  add column if not exists passport_expiry date,
  add column if not exists has_travel_id   boolean;

comment on column public.players.passport_expiry is
  'Passport expiry date only, self-reported on /collect. The passport NUMBER is intentionally never stored (see 049).';
comment on column public.players.has_travel_id is
  'Self-reported: holds a valid government photo ID accepted for travel (REAL ID, passport). Null = not answered.';
