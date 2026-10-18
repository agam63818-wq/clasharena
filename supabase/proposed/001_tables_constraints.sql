-- ============================================================================
-- NOT APPLIED. For the database phase.
-- OUTDATED - written for uuid ids.
-- The live database was changed separately; do not apply.
-- 001_tables_constraints.sql
-- Tables, columns and constraints the ClashArena code requires.
-- Idempotent: every step checks its precondition before running.
-- Companion docs: docs/DB_REQUIREMENTS.md, docs/AUDIT.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  phone      text,
  role       text not null default 'user',
  balance    numeric(12,2) not null default 0,
  level      int not null default 1,
  wins       int not null default 0,
  ff_id      text,
  nickname   text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- add any missing columns to a pre-existing profiles table
do $$
begin
  if to_regclass('public.profiles') is not null then
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone')
      then alter table public.profiles add column phone text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'role')
      then alter table public.profiles add column role text not null default 'user'; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'balance')
      then alter table public.profiles add column balance numeric(12,2) not null default 0; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'level')
      then alter table public.profiles add column level int not null default 1; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'wins')
      then alter table public.profiles add column wins int not null default 0; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'ff_id')
      then alter table public.profiles add column ff_id text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'nickname')
      then alter table public.profiles add column nickname text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url')
      then alter table public.profiles add column avatar_url text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at')
      then alter table public.profiles add column created_at timestamptz not null default now(); end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. tournaments
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  mode            text not null default 'Solo',
  prize           numeric(12,2) not null default 0,
  entry_fee       numeric(12,2) not null default 0,
  max_players     int not null default 100,
  current_players int not null default 0,
  status          text not null default 'registration',
  match_time      timestamptz,
  room_id         text,
  room_password   text,
  image_url       text,
  rules           text,
  created_at      timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.tournaments') is not null then
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tournaments' and column_name = 'current_players')
      then alter table public.tournaments add column current_players int not null default 0; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tournaments' and column_name = 'match_time')
      then alter table public.tournaments add column match_time timestamptz; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tournaments' and column_name = 'rules')
      then alter table public.tournaments add column rules text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'tournaments' and column_name = 'created_at')
      then alter table public.tournaments add column created_at timestamptz not null default now(); end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. match_registrations
-- ---------------------------------------------------------------------------
create table if not exists public.match_registrations (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  user_id       uuid not null,
  ff_uid        text not null,
  ign           text not null,
  status        text not null default 'joined',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  type       text not null,
  amount     numeric(12,2) not null,
  status     text not null default 'completed',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 5. Constraints (each added only if absent; data-safe)
-- ============================================================================

-- CHECK constraints are added NOT VALID so legacy rows can never block the
-- migration. Run `VALIDATE CONSTRAINT` later once data is confirmed clean.
do $$
begin
  -- profiles.role in ('user','admin')  [required by code: App.jsx:395, deleteTournament.js:28]
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user','admin')) not valid;
  end if;

  -- profiles.balance >= 0  [recommended: closes overdraw race, AUDIT P0-6]
  if not exists (select 1 from pg_constraint where conname = 'profiles_balance_nonnegative_check') then
    alter table public.profiles
      add constraint profiles_balance_nonnegative_check check (balance >= 0) not valid;
  end if;

  -- tournaments.status  [required by code: src/lib/tournamentStatus.js,
  -- api/_lib/validate.js TOURNAMENT_STATUSES; 'cancelled' is produced by the
  -- admin cancel flow — see 006_cancel_tournament_refunds.sql §2, which
  -- replaces this constraint on a database where an earlier version exists.]
  if not exists (select 1 from pg_constraint where conname = 'tournaments_status_check') then
    alter table public.tournaments
      add constraint tournaments_status_check
      check (status in ('registration','upcoming','live','completed','cancelled')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tournaments_entry_fee_check') then
    alter table public.tournaments
      add constraint tournaments_entry_fee_check check (entry_fee >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tournaments_prize_check') then
    alter table public.tournaments
      add constraint tournaments_prize_check check (prize >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tournaments_max_players_check') then
    alter table public.tournaments
      add constraint tournaments_max_players_check check (max_players >= 1) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tournaments_current_players_check') then
    alter table public.tournaments
      add constraint tournaments_current_players_check check (current_players >= 0) not valid;
  end if;

  -- transactions.amount <> 0  [recommended: AUDIT P2-3]
  if not exists (select 1 from pg_constraint where conname = 'transactions_amount_nonzero_check') then
    alter table public.transactions
      add constraint transactions_amount_nonzero_check check (amount <> 0) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5a. UNIQUE (tournament_id, user_id) on match_registrations
-- [required by code: duplicate-join path relies on Postgres 23505 —
--  api/joinTournament.js:93, client branch App.jsx:596]
-- Precondition: existing duplicate pairs are reported; the index is skipped
-- rather than failing, so the migration can be re-run after deduplication.
-- ---------------------------------------------------------------------------
do $$
declare
  dup_count int;
begin
  select count(*) into dup_count from (
    select tournament_id, user_id
    from public.match_registrations
    group by tournament_id, user_id
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise notice 'SKIPPED: % duplicate (tournament_id, user_id) pairs exist. Deduplicate, then re-run.', dup_count;
  else
    create unique index if not exists match_registrations_tournament_user_uidx
      on public.match_registrations (tournament_id, user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5b. UNIQUE (username) on profiles
-- [required by code: "Username already taken" path — App.jsx:163]
-- Same precondition pattern as 5a.
-- ---------------------------------------------------------------------------
do $$
declare
  dup_count int;
begin
  select count(*) into dup_count from (
    select lower(username) u, count(*)
    from public.profiles group by lower(username) having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise notice 'SKIPPED: % duplicate usernames exist (case-insensitive). Deduplicate, then re-run.', dup_count;
  else
    create unique index if not exists profiles_username_uidx
      on public.profiles (lower(username));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Foreign keys
-- [required by code: relational queries — App.jsx:1056-1058 profiles(username),
--  App.jsx:1403-1417 registrations -> tournaments]
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'match_registrations_tournament_id_fkey'
      and conrelid = 'public.match_registrations'::regclass
  ) then
    alter table public.match_registrations
      add constraint match_registrations_tournament_id_fkey
      foreign key (tournament_id) references public.tournaments (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'match_registrations_user_id_fkey'
      and conrelid = 'public.match_registrations'::regclass
  ) then
    alter table public.match_registrations
      add constraint match_registrations_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_user_id_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Plain indexes
-- ---------------------------------------------------------------------------
create index if not exists match_registrations_user_id_idx
  on public.match_registrations (user_id);            -- [required by code: MyMatches filter, App.jsx:1418]

create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);  -- [required by code: wallet query, App.jsx:684]

create index if not exists tournaments_created_at_idx
  on public.tournaments (created_at desc);            -- [required by code: home list order, App.jsx:363]

create index if not exists tournaments_status_idx
  on public.tournaments (status);                     -- [recommended: admin dashboard counts, App.jsx:1160-1164]

-- End of 001. Nothing in this file has been executed anywhere.
