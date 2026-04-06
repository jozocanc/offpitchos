-- AI chat history for the Ask page
create table ai_chats (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_ai_chats_club on ai_chats(club_id, created_at desc);
create index idx_ai_chats_profile on ai_chats(profile_id, created_at desc);

-- RLS
alter table ai_chats enable row level security;

-- Users can read their own chats
create policy ai_chats_own_read on ai_chats
  for select using (
    profile_id in (select get_user_profile_ids())
  );

-- DOC can read all chats in their club
create policy ai_chats_doc_read on ai_chats
  for select using (
    club_id in (select get_doc_club_ids())
  );

-- Users can insert their own chats
create policy ai_chats_insert on ai_chats
  for insert with check (
    profile_id in (select get_user_profile_ids())
    and club_id in (select get_user_club_ids())
  );
