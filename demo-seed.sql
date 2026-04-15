-- ============================================
-- DEMO DATA: 3 teams, 28 players, events, coach + parent accounts
-- Paste into Supabase SQL Editor → Run
-- ============================================

-- Step 1: Fix coach + parent profiles so they belong to the club
UPDATE profiles
SET club_id = (SELECT id FROM clubs LIMIT 1),
    role = 'coach',
    onboarding_complete = true,
    display_name = 'Coach Cancar'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'jozo.cancar27+coach@gmail.com');

UPDATE profiles
SET club_id = (SELECT id FROM clubs LIMIT 1),
    role = 'parent',
    onboarding_complete = true,
    display_name = 'Parent Cancar'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'jozo.cancar27+parent@gmail.com');

-- Step 2: Clean slate — delete all existing data for this club
DELETE FROM camp_registrations WHERE camp_detail_id IN (
  SELECT id FROM camp_details WHERE club_id = (SELECT id FROM clubs LIMIT 1)
);
DELETE FROM camp_details WHERE club_id = (SELECT id FROM clubs LIMIT 1);
DELETE FROM coverage_responses WHERE coverage_request_id IN (
  SELECT id FROM coverage_requests WHERE club_id = (SELECT id FROM clubs LIMIT 1)
);
DELETE FROM coverage_requests WHERE club_id = (SELECT id FROM clubs LIMIT 1);
DELETE FROM player_feedback WHERE club_id = (SELECT id FROM clubs LIMIT 1);
DELETE FROM attendance WHERE event_id IN (
  SELECT id FROM events WHERE club_id = (SELECT id FROM clubs LIMIT 1)
);
DELETE FROM notifications WHERE event_id IN (
  SELECT id FROM events WHERE club_id = (SELECT id FROM clubs LIMIT 1)
);
DELETE FROM events WHERE club_id = (SELECT id FROM clubs LIMIT 1);
DELETE FROM players WHERE club_id = (SELECT id FROM clubs LIMIT 1);
DELETE FROM team_members WHERE team_id IN (
  SELECT id FROM teams WHERE club_id = (SELECT id FROM clubs LIMIT 1)
);
DELETE FROM invites WHERE club_id = (SELECT id FROM clubs LIMIT 1);
DELETE FROM teams WHERE club_id = (SELECT id FROM clubs LIMIT 1);

-- Step 3: Create 3 teams
INSERT INTO teams (name, age_group, club_id) VALUES
  ('Thunder',   'U14', (SELECT id FROM clubs LIMIT 1)),
  ('Lightning', 'U12', (SELECT id FROM clubs LIMIT 1)),
  ('Stars',     'U10', (SELECT id FROM clubs LIMIT 1));

-- Step 4: Add team members (DOC on all, coach on Thunder + Lightning, parent on all)
-- DOC
INSERT INTO team_members (team_id, profile_id, role)
SELECT t.id, p.id, 'coach'
FROM teams t CROSS JOIN profiles p
WHERE t.club_id = (SELECT id FROM clubs LIMIT 1)
AND p.role = 'doc' AND p.club_id = (SELECT id FROM clubs LIMIT 1)
ON CONFLICT (team_id, profile_id) DO NOTHING;

-- Coach Cancar → Thunder + Lightning
INSERT INTO team_members (team_id, profile_id, role)
SELECT t.id, p.id, 'coach'
FROM teams t CROSS JOIN profiles p
WHERE t.club_id = (SELECT id FROM clubs LIMIT 1)
AND t.name IN ('Thunder', 'Lightning')
AND p.user_id = (SELECT id FROM auth.users WHERE email = 'jozo.cancar27+coach@gmail.com')
ON CONFLICT (team_id, profile_id) DO NOTHING;

-- Parent Cancar → all 3 teams
INSERT INTO team_members (team_id, profile_id, role)
SELECT t.id, p.id, 'parent'
FROM teams t CROSS JOIN profiles p
WHERE t.club_id = (SELECT id FROM clubs LIMIT 1)
AND p.user_id = (SELECT id FROM auth.users WHERE email = 'jozo.cancar27+parent@gmail.com')
ON CONFLICT (team_id, profile_id) DO NOTHING;

-- Step 5: Add players
-- Helper variables via subqueries
-- Parent's kids (parent_id = parent user)
-- Other kids (parent_id = DOC user, so they show as "Unlinked")

-- === THUNDER U14 (10 players) ===
INSERT INTO players (first_name, last_name, jersey_number, position, team_id, club_id, parent_id) VALUES
('Luka',   'Cancar',    10, 'Forward',    (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27+parent@gmail.com')),
('Ethan',  'Rivera',     4, 'Defender',   (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Noah',   'Kim',        8, 'Midfielder', (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Jayden', 'Williams',  11, 'Forward',    (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Aiden',  'Thompson',   2, 'Defender',   (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Carlos', 'Mendez',     6, 'Midfielder', (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Ryan',   'O''Brien',   1, 'Goalkeeper', (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Tyler',  'Brooks',     3, 'Defender',   (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Mason',  'Clark',      9, 'Forward',    (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Jordan', 'Lee',        5, 'Midfielder', (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com'));

-- === LIGHTNING U12 (10 players) ===
INSERT INTO players (first_name, last_name, jersey_number, position, team_id, club_id, parent_id) VALUES
('Mateo',  'Cancar',     7, 'Midfielder', (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27+parent@gmail.com')),
('Leo',    'Garcia',    10, 'Forward',    (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Owen',   'Davis',      3, 'Defender',   (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Liam',   'Patel',      8, 'Midfielder', (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Elijah', 'Thomas',     1, 'Goalkeeper', (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Jake',   'Martinez',  11, 'Forward',    (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Dylan',  'Cooper',     2, 'Defender',   (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Caleb',  'Adams',      5, 'Midfielder', (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Brody',  'Hall',       4, 'Defender',   (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Austin', 'Wright',     9, 'Forward',    (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com'));

-- === STARS U10 (8 players) ===
INSERT INTO players (first_name, last_name, jersey_number, position, team_id, club_id, parent_id) VALUES
('Mia',      'Cancar',    3, 'Midfielder', (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27+parent@gmail.com')),
('Sophia',   'Reyes',     7, 'Forward',    (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Emma',     'Chen',     10, 'Forward',    (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Olivia',   'Brown',     1, 'Goalkeeper', (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Ava',      'Taylor',    8, 'Midfielder', (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Isabella', 'Wilson',    5, 'Defender',   (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Lily',     'Anderson',  4, 'Defender',   (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Chloe',    'Scott',     2, 'Midfielder', (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com'));

-- Step 6: Create events for the next 2 weeks so the schedule isn't empty
-- Practices: Mon/Wed/Fri at various times
-- Games: Saturday mornings

INSERT INTO events (title, type, team_id, club_id, start_time, end_time, status, created_by) VALUES
-- Thunder U14 practices + game
('Thunder Practice',  'practice', (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), NOW() + interval '1 day' + time '17:00', NOW() + interval '1 day' + time '18:30', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Thunder Practice',  'practice', (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), NOW() + interval '3 days' + time '17:00', NOW() + interval '3 days' + time '18:30', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Thunder vs Eagles', 'game',     (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), NOW() + interval '5 days' + time '09:00', NOW() + interval '5 days' + time '10:30', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Thunder Practice',  'practice', (SELECT id FROM teams WHERE name = 'Thunder'),   (SELECT id FROM clubs LIMIT 1), NOW() + interval '8 days' + time '17:00', NOW() + interval '8 days' + time '18:30', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),

-- Lightning U12 practices + game
('Lightning Practice',  'practice', (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '1 day' + time '16:00',  NOW() + interval '1 day' + time '17:30',  'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Lightning Practice',  'practice', (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '3 days' + time '16:00', NOW() + interval '3 days' + time '17:30', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Lightning vs Hawks',  'game',     (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '5 days' + time '11:00', NOW() + interval '5 days' + time '12:30', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Lightning Practice',  'practice', (SELECT id FROM teams WHERE name = 'Lightning'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '8 days' + time '16:00', NOW() + interval '8 days' + time '17:30', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),

-- Stars U10 practices + game
('Stars Practice',  'practice', (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '2 days' + time '15:00', NOW() + interval '2 days' + time '16:00', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Stars Practice',  'practice', (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '4 days' + time '15:00', NOW() + interval '4 days' + time '16:00', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Stars vs Panthers', 'game',   (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '6 days' + time '09:00', NOW() + interval '6 days' + time '10:00', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com')),
('Stars Practice',  'practice', (SELECT id FROM teams WHERE name = 'Stars'), (SELECT id FROM clubs LIMIT 1), NOW() + interval '9 days' + time '15:00', NOW() + interval '9 days' + time '16:00', 'scheduled', (SELECT id FROM auth.users WHERE email = 'jozo.cancar27@gmail.com'));

-- Done! Summary:
-- 3 teams: Thunder U14, Lightning U12, Stars U10
-- 28 players (3 linked to Parent Cancar, 25 unlinked)
-- 12 events over the next 9 days
-- Coach Cancar assigned to Thunder + Lightning
-- Parent Cancar as member on all 3 teams
