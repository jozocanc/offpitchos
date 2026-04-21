-- ============================================================
-- 024_drill_versions.sql — Tactics Board Phase D
--
-- drill_versions: auto-snapshot on every save, capped at 10 per drill
-- ============================================================

create table drill_versions (
  id uuid primary key default gen_random_uuid(),
  drill_id uuid not null references drills(id) on delete cascade,
  field jsonb not null,
  objects jsonb not null,
  saved_by uuid not null references profiles(id),
  saved_at timestamptz not null default now()
);

create index idx_drill_versions_drill_saved on drill_versions(drill_id, saved_at desc);

-- Trim to 10 most recent per drill after every insert
create or replace function trim_drill_versions() returns trigger as $$
begin
  delete from drill_versions
  where drill_id = NEW.drill_id
    and id not in (
      select id from drill_versions
      where drill_id = NEW.drill_id
      order by saved_at desc
      limit 10
    );
  return NEW;
end;
$$ language plpgsql;

create trigger trg_drill_versions_trim
  after insert on drill_versions
  for each row execute function trim_drill_versions();

-- RLS
alter table drill_versions enable row level security;

-- Select: if you can see the parent drill you can see its versions
create policy drill_versions_select on drill_versions for select using (
  exists (select 1 from drills d where d.id = drill_versions.drill_id)
);

-- Insert: doc or coach who can reach the drill
create policy drill_versions_insert on drill_versions for insert with check (
  exists (select 1 from drills d where d.id = drill_versions.drill_id)
  and exists (select 1 from drills_caller_profile() cp where cp.role in ('doc','coach'))
);
