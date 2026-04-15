-- OffPitchOS — Additional Demo Events
-- Adds more practices, games, and one new camp on top of the existing demo data.
-- Run this in Supabase SQL Editor after seed-demo-data.sql.
--
-- Per team:
--   - 6 practices (3 past, 3 future) — Tue & Thu evenings, 5:00–6:30pm
--   - 3 games    (1 past, 2 future) — Saturday mornings, 10:00–11:30am
-- Plus one club-wide new camp 2 weeks out with capacity & registrations.

DO $$
DECLARE
  v_club_id uuid;
  v_doc_id uuid;
  v_doc_user_id uuid;
  v_team record;
  v_event_row record;
  v_venue_id uuid;
  v_camp_team_id uuid;
  v_camp_event_id uuid;
  v_camp_detail_id uuid;
  v_player_id uuid;
  v_start timestamptz;
  i int;
  practice_offsets int[] := ARRAY[-14, -11, -7, 4, 7, 11];  -- days from today
  game_offsets int[]     := ARRAY[-9, 5, 12];               -- Saturdays-ish
BEGIN
  -- Resolve club + DOC
  SELECT club_id INTO v_club_id FROM profiles LIMIT 1;
  SELECT id, user_id INTO v_doc_id, v_doc_user_id
    FROM profiles WHERE club_id = v_club_id AND role = 'doc' LIMIT 1;

  -- Pick a venue if any exist (optional)
  SELECT id INTO v_venue_id FROM venues WHERE club_id = v_club_id LIMIT 1;

  -- ---------------------------------------------------------------
  -- Practices & games for every team
  -- ---------------------------------------------------------------
  FOR v_team IN SELECT id, name FROM teams WHERE club_id = v_club_id
  LOOP
    -- Practices: 5:00pm – 6:30pm local
    FOREACH i IN ARRAY practice_offsets
    LOOP
      v_start := date_trunc('day', now()) + (i || ' days')::interval + interval '17 hours';
      INSERT INTO events (club_id, team_id, type, title, start_time, end_time, venue_id, created_by)
      VALUES (
        v_club_id, v_team.id, 'practice',
        v_team.name || ' Practice',
        v_start, v_start + interval '1 hour 30 minutes',
        v_venue_id, v_doc_user_id
      );
    END LOOP;

    -- Games: 10:00am – 11:30am local
    FOREACH i IN ARRAY game_offsets
    LOOP
      v_start := date_trunc('day', now()) + (i || ' days')::interval + interval '10 hours';
      INSERT INTO events (club_id, team_id, type, title, start_time, end_time, venue_id, created_by)
      VALUES (
        v_club_id, v_team.id, 'game',
        v_team.name || ' vs Rival FC',
        v_start, v_start + interval '1 hour 30 minutes',
        v_venue_id, v_doc_user_id
      );
    END LOOP;
  END LOOP;

  -- ---------------------------------------------------------------
  -- Attendance for past practice/game events that have none yet
  -- ---------------------------------------------------------------
  FOR v_event_row IN
    SELECT e.id AS event_id, e.team_id
    FROM events e
    WHERE e.club_id = v_club_id
      AND e.status = 'scheduled'
      AND e.start_time < now()
      AND e.start_time > now() - interval '21 days'
      AND e.type IN ('practice','game')
      AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.event_id = e.id)
  LOOP
    FOR v_player_id IN SELECT id FROM players WHERE team_id = v_event_row.team_id
    LOOP
      INSERT INTO attendance (event_id, player_id, status, marked_by)
      VALUES (
        v_event_row.event_id,
        v_player_id,
        (ARRAY['present','present','present','present','late','absent','excused'])[1 + (random() * 6)::int],
        v_doc_user_id
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- ---------------------------------------------------------------
  -- One new camp — Spring Skills Camp, 2 weeks out
  -- Attached to the first team; open to all club players for registration
  -- ---------------------------------------------------------------
  SELECT id INTO v_camp_team_id FROM teams WHERE club_id = v_club_id ORDER BY created_at LIMIT 1;

  v_start := date_trunc('day', now()) + interval '14 days' + interval '9 hours';
  INSERT INTO events (club_id, team_id, type, title, start_time, end_time, venue_id, notes, created_by)
  VALUES (
    v_club_id, v_camp_team_id, 'camp',
    'Spring Skills Camp',
    v_start, v_start + interval '6 hours',
    v_venue_id,
    'Three-day intensive skills camp. Open to all ages. Lunch included.',
    v_doc_user_id
  )
  RETURNING id INTO v_camp_event_id;

  INSERT INTO camp_details (event_id, club_id, fee_cents, capacity)
  VALUES (v_camp_event_id, v_club_id, 22500, 30)
  RETURNING id INTO v_camp_detail_id;

  -- Register ~12 random players from the club for the new camp
  FOR v_player_id IN
    SELECT id FROM players WHERE club_id = v_club_id ORDER BY random() LIMIT 12
  LOOP
    INSERT INTO camp_registrations (camp_detail_id, player_id, registered_by, payment_status)
    VALUES (
      v_camp_detail_id,
      v_player_id,
      v_doc_id,
      (ARRAY['paid','paid','paid','unpaid'])[1 + (random() * 3)::int]
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
