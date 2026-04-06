create table player_feedback (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  coach_id uuid not null references profiles(id),
  event_id uuid references events(id) on delete set null,
  category text not null check (category in ('technical', 'tactical', 'physical', 'attitude', 'general')),
  rating int check (rating >= 1 and rating <= 5),
  notes text not null,
  created_at timestamptz not null default now()
);

create index idx_feedback_player on player_feedback(player_id, created_at desc);
create index idx_feedback_club on player_feedback(club_id);
create index idx_feedback_coach on player_feedback(coach_id);

alter table player_feedback enable row level security;

-- DOC can see all feedback in their club
create policy feedback_doc_all on player_feedback for all
  using (club_id in (select get_doc_club_ids()));

-- Coaches can read and write feedback in their club
create policy feedback_coach_read on player_feedback for select
  using (club_id in (select get_user_club_ids()));

create policy feedback_coach_insert on player_feedback for insert
  with check (
    coach_id in (select get_user_profile_ids())
    and club_id in (select get_user_club_ids())
  );

-- Parents can read feedback for their own children
create policy feedback_parent_read on player_feedback for select
  using (
    player_id in (
      select id from players where parent_id = auth.uid()
    )
  );
