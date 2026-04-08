-- OffPitchOS Demo Data Seed
-- Run this in Supabase SQL Editor to populate realistic demo data

-- Step 1: Rename club to Boca High
UPDATE clubs SET name = 'Boca High' WHERE id = (SELECT club_id FROM profiles LIMIT 1);

-- Step 2: Get the club_id and a coach profile for reference
DO $$
DECLARE
  v_club_id uuid;
  v_coach_id uuid;
  v_doc_id uuid;
  v_team record;
  v_player_id uuid;
  v_event record;
  i int;
  first_names text[] := ARRAY['James','Michael','Daniel','David','Alex','Ryan','Chris','Noah','Ethan','Lucas','Mason','Logan','Jack','Owen','Liam','Ben','Sam','Max','Jake','Tyler','Connor','Dylan','Nathan','Kyle','Brandon','Cole','Jayden','Aiden','Caleb','Hunter'];
  last_names text[] := ARRAY['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Clark','Lewis','Walker','Hall','Young','King','Wright'];
  positions text[] := ARRAY['Forward','Midfielder','Defender','Goalkeeper','Winger','Striker','Center Back','Full Back'];
  jersey_sizes text[] := ARRAY['YXS','YS','YM','YL','YXL','AS'];
  shorts_sizes text[] := ARRAY['YXS','YS','YM','YL','YXL','AS'];
  feedback_notes text[] := ARRAY[
    'Great improvement in ball control today. Keep working on first touch.',
    'Strong defensive positioning. Needs to work on passing under pressure.',
    'Excellent attitude and effort in practice. Always first to arrive.',
    'Good game awareness. Starting to read the play much better.',
    'Needs to work on weaker foot. Right foot is very strong.',
    'Impressive speed and agility. One of the fastest on the team.',
    'Communication on the field has improved significantly this month.',
    'Solid tackling technique. Clean and well-timed challenges.',
    'Creative with the ball. Finding good passing lanes consistently.',
    'Physical development coming along well. Getting stronger each week.',
    'Showed great leadership during the scrimmage today.',
    'Needs to stay focused during the full session. Tends to drift off.',
    'Exceptional work rate. Never stops running. Great stamina.',
    'Touch and technique are above average for the age group.',
    'Goalkeeper reflexes are sharp. Distribution needs more work.'
  ];
  categories text[] := ARRAY['technical','tactical','physical','attitude','general'];
BEGIN
  -- Get club and profile IDs
  SELECT club_id INTO v_club_id FROM profiles LIMIT 1;
  SELECT id INTO v_doc_id FROM profiles WHERE club_id = v_club_id AND role = 'doc' LIMIT 1;
  SELECT id INTO v_coach_id FROM profiles WHERE club_id = v_club_id AND role = 'coach' LIMIT 1;

  -- If no coach, use doc as coach for feedback
  IF v_coach_id IS NULL THEN
    v_coach_id := v_doc_id;
  END IF;

  -- Step 3: Add players to each team
  FOR v_team IN SELECT id, age_group FROM teams WHERE club_id = v_club_id
  LOOP
    FOR i IN 1..12
    LOOP
      INSERT INTO players (
        parent_id, team_id, club_id,
        first_name, last_name, jersey_number, position,
        date_of_birth, jersey_size, shorts_size
      )
      SELECT
        (SELECT user_id FROM profiles WHERE club_id = v_club_id LIMIT 1),
        v_team.id,
        v_club_id,
        first_names[1 + (random() * 29)::int],
        last_names[1 + (random() * 24)::int],
        i,
        positions[1 + (random() * 7)::int],
        CURRENT_DATE - ((8 + (random() * 10)::int) * 365 || ' days')::interval,
        jersey_sizes[1 + (random() * 5)::int],
        shorts_sizes[1 + (random() * 5)::int]
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Step 4: Add attendance records for recent events
  FOR v_event IN
    SELECT e.id as event_id, e.team_id
    FROM events e
    WHERE e.club_id = v_club_id
      AND e.status = 'scheduled'
      AND e.start_time < now()
    ORDER BY e.start_time DESC
    LIMIT 20
  LOOP
    FOR v_player_id IN
      SELECT id FROM players WHERE team_id = v_event.team_id
    LOOP
      INSERT INTO attendance (event_id, player_id, status)
      VALUES (
        v_event.event_id,
        v_player_id,
        (ARRAY['present','present','present','present','late','absent','excused'])[1 + (random() * 6)::int]
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Step 5: Add player feedback
  FOR v_player_id IN
    SELECT id FROM players WHERE club_id = v_club_id ORDER BY random() LIMIT 30
  LOOP
    FOR i IN 1..2
    LOOP
      INSERT INTO player_feedback (
        player_id, club_id, coach_id, category, rating, notes, created_at
      )
      VALUES (
        v_player_id,
        v_club_id,
        v_coach_id,
        categories[1 + (random() * 4)::int],
        3 + (random() * 2)::int,
        feedback_notes[1 + (random() * 14)::int],
        now() - ((random() * 30)::int || ' days')::interval
      );
    END LOOP;
  END LOOP;

  -- Step 6: Add camp details and registrations for camp events
  FOR v_event IN
    SELECT id, team_id FROM events
    WHERE club_id = v_club_id AND type = 'camp'
    ORDER BY start_time
    LIMIT 5
  LOOP
    INSERT INTO camp_details (event_id, club_id, fee_cents, capacity)
    VALUES (v_event.id, v_club_id, (ARRAY[15000, 20000, 25000, 30000])[1 + (random() * 3)::int], 25)
    ON CONFLICT (event_id) DO NOTHING;

    -- Register some players
    FOR v_player_id IN
      SELECT id FROM players WHERE team_id = v_event.team_id ORDER BY random() LIMIT 8
    LOOP
      INSERT INTO camp_registrations (camp_detail_id, player_id, registered_by, payment_status)
      SELECT
        cd.id,
        v_player_id,
        v_doc_id,
        (ARRAY['paid','paid','paid','unpaid'])[1 + (random() * 3)::int]
      FROM camp_details cd
      WHERE cd.event_id = v_event.id
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

END $$;
