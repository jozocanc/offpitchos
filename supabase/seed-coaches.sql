-- OffPitchOS — Seed demo coaches
-- Adds 2 coach profiles per team with realistic names.
-- Run once in Supabase SQL Editor.
--
-- Notes on safety:
--   - Coaches are created as confirmed auth users with random unguessable
--     passwords so nobody can log in as them.
--   - Emails are namespaced under @demo.offpitchos.local to avoid collision
--     with real users.
--   - Idempotent on re-run for the team_members link (UNIQUE constraint),
--     but the auth.users / profiles inserts will skip duplicates via
--     ON CONFLICT.

DO $$
DECLARE
  v_club_id uuid;
  v_team record;
  v_user_id uuid;
  v_profile_id uuid;
  v_first text;
  v_last text;
  v_email text;
  i int;
  first_names text[] := ARRAY[
    'Marco','Sofia','Diego','Carlos','Luis','Alejandro','Javier','Ricardo',
    'Andres','Pablo','Sergio','Fernando','Roberto','Mateo','Emilio',
    'Isabella','Lucia','Valentina','Camila','Elena'
  ];
  last_names text[] := ARRAY[
    'Hernandez','Gonzalez','Rodriguez','Lopez','Martinez','Sanchez','Perez',
    'Ramirez','Torres','Flores','Rivera','Gomez','Diaz','Reyes','Morales',
    'Vargas','Castro','Ortiz','Silva','Mendoza'
  ];
BEGIN
  -- Resolve club
  SELECT club_id INTO v_club_id FROM profiles LIMIT 1;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'No club found';
  END IF;

  -- For every team, create 2 coaches
  FOR v_team IN SELECT id, name FROM teams WHERE club_id = v_club_id ORDER BY name
  LOOP
    FOR i IN 1..2
    LOOP
      v_first := first_names[1 + (random() * 19)::int];
      v_last  := last_names[1 + (random() * 19)::int];
      v_email := lower(v_first) || '.' || lower(v_last) || '.' ||
                 substr(md5(random()::text || clock_timestamp()::text), 1, 6) ||
                 '@demo.offpitchos.local';

      -- 1) Create auth user (random unguessable password)
      INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        v_email,
        crypt(md5(random()::text || clock_timestamp()::text), gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', v_first || ' ' || v_last),
        now(),
        now()
      )
      RETURNING id INTO v_user_id;

      -- 2) Create profile linked to that auth user
      INSERT INTO profiles (user_id, club_id, role, display_name, onboarding_complete)
      VALUES (v_user_id, v_club_id, 'coach', v_first || ' ' || v_last, true)
      RETURNING id INTO v_profile_id;

      -- 3) Link profile to team as a coach
      INSERT INTO team_members (team_id, profile_id, role)
      VALUES (v_team.id, v_profile_id, 'coach')
      ON CONFLICT (team_id, profile_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
