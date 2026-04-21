-- ============================================================
-- 025_drill_comments.sql — Tactics Board Phase D
--
-- drill_comments: threaded coach notes on a drill
-- ============================================================

create table drill_comments (
  id uuid primary key default gen_random_uuid(),
  drill_id uuid not null references drills(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(body) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index idx_drill_comments_drill on drill_comments(drill_id, created_at desc);

alter table drill_comments enable row level security;

-- Select: if you can see the parent drill you can see comments
create policy drill_comments_select on drill_comments for select using (
  exists (select 1 from drills d where d.id = drill_comments.drill_id)
);

-- Insert: doc or coach who can read the drill
create policy drill_comments_insert on drill_comments for insert with check (
  exists (select 1 from drills d where d.id = drill_comments.drill_id)
  and exists (select 1 from drills_caller_profile() cp where cp.role in ('doc','coach'))
);

-- Delete: author or doc
create policy drill_comments_delete on drill_comments for delete using (
  drill_comments.author_id = (
    select id from profiles where user_id = auth.uid() limit 1
  )
  or exists (select 1 from drills_caller_profile() cp where cp.role = 'doc')
);
