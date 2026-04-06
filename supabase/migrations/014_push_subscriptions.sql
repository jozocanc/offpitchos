create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(profile_id, endpoint)
);

create index idx_push_sub_profile on push_subscriptions(profile_id);

alter table push_subscriptions enable row level security;

create policy push_sub_own on push_subscriptions for all
  using (profile_id in (select get_user_profile_ids()));
