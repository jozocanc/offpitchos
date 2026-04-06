-- Camp details — extends events of type 'camp' with fee and capacity
create table camp_details (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  fee_cents int not null default 0,
  capacity int,
  created_at timestamptz not null default now()
);

create unique index idx_camp_details_event on camp_details(event_id);
create index idx_camp_details_club on camp_details(club_id);

alter table camp_details enable row level security;

create policy camp_details_doc_all on camp_details for all
  using (club_id in (select get_doc_club_ids()));

create policy camp_details_read on camp_details for select
  using (club_id in (select get_user_club_ids()));

-- Camp registrations — players signed up for camps
create table camp_registrations (
  id uuid primary key default gen_random_uuid(),
  camp_detail_id uuid not null references camp_details(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  registered_by uuid not null references profiles(id),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  created_at timestamptz not null default now()
);

create unique index idx_camp_reg_unique on camp_registrations(camp_detail_id, player_id);
create index idx_camp_reg_camp on camp_registrations(camp_detail_id);
create index idx_camp_reg_player on camp_registrations(player_id);

alter table camp_registrations enable row level security;

create policy camp_reg_doc_all on camp_registrations for all
  using (
    camp_detail_id in (
      select id from camp_details where club_id in (select get_doc_club_ids())
    )
  );

create policy camp_reg_read on camp_registrations for select
  using (
    camp_detail_id in (
      select id from camp_details where club_id in (select get_user_club_ids())
    )
  );

create policy camp_reg_parent_insert on camp_registrations for insert
  with check (
    registered_by in (select get_user_profile_ids())
  );
