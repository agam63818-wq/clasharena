-- ============================================================================
-- NOT APPLIED. For the database phase.
-- 003_functions_triggers.sql
-- Atomic join RPC, room-details gate, profile column protection, count trigger.
-- These close AUDIT P0-1, P0-2 (with the API change), P0-3, P0-4, P0-6.
-- Idempotent: create-or-replace / drop-if-exists throughout.
-- Companion docs: docs/DB_REQUIREMENTS.md §3, docs/AUDIT.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. protect_profiles_columns — BEFORE INSERT/UPDATE on profiles
-- [recommended, closes AUDIT P0-4]
-- On non-service-role sessions: forces role='user' and balance=0 on insert,
-- and rejects any change to role/balance/wins/level/username on update.
-- auth.role() reads the JWT 'role' claim ('anon' | 'authenticated' |
-- 'service_role').
-- ---------------------------------------------------------------------------
create or replace function public.protect_profiles_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'anon') = 'service_role' then
    return new;  -- server code (api/*) is trusted
  end if;

  if tg_op = 'INSERT' then
    new.role    := 'user';   -- client hardcodes this today (App.jsx:158); the DB now enforces it
    new.balance := 0;        -- wallets start at zero, period
    new.wins    := coalesce(new.wins, 0);
    new.level   := coalesce(new.level, 1);
    return new;
  end if;

  -- UPDATE by a normal user
  if new.role    is distinct from old.role
  or new.balance is distinct from old.balance
  or new.wins    is distinct from old.wins
  or new.level   is distinct from old.level
  or new.username is distinct from old.username then
    raise exception 'profiles: role, balance, wins, level and username cannot be changed by users'
      using errcode = '42501';  -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profiles_columns_trg on public.profiles;
create trigger protect_profiles_columns_trg
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_columns();

-- ---------------------------------------------------------------------------
-- 2. join_tournament — the whole join in ONE atomic unit
-- [recommended, closes AUDIT P0-1 + P0-6]
-- Called by an authenticated API route; the caller identity comes from the
-- JWT (auth.uid()), never from a request body. The entry fee comes from
-- tournaments.entry_fee, never from the client.
-- Response shape mirrors the current API for backward compatibility:
--   success: {"success": true}
--   failure: {"error": "..."}  /  {"error": "Already joined", "code": "23505"}
-- ---------------------------------------------------------------------------
create or replace function public.join_tournament(
  p_tournament_id uuid,
  p_ff_uid        text,
  p_ign           text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_fee            numeric(12,2);
  v_balance        numeric(12,2);
  v_max_players    int;
  v_current        int;
begin
  if v_uid is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  p_ff_uid := trim(coalesce(p_ff_uid, ''));
  p_ign    := trim(coalesce(p_ign, ''));
  if p_ff_uid = '' or p_ign = '' then
    return json_build_object('error', 'Missing data');
  end if;

  -- Lock the tournament row: capacity check + fee derivation share one lock,
  -- removing the TOCTOU race (AUDIT P0-6).
  select entry_fee, max_players, current_players
    into v_fee, v_max_players, v_current
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    return json_build_object('error', 'Tournament not found');
  end if;

  if v_current >= v_max_players then
    return json_build_object('error', 'Tournament is full');
  end if;

  -- Duplicate check up-front for a clean message; the unique index
  -- (match_registrations_tournament_user_uidx, 001) remains the backstop.
  if exists (
    select 1 from public.match_registrations
    where tournament_id = p_tournament_id and user_id = v_uid
  ) then
    return json_build_object('error', 'You already joined this tournament');
  end if;

  -- Lock the profile row and deduct. The balance >= 0 constraint from 001 is
  -- the final guard against concurrent overdraw.
  select balance into v_balance
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    return json_build_object('error', 'Profile not found');
  end if;

  if v_balance < v_fee then
    return json_build_object('error', 'Insufficient balance');
  end if;

  update public.profiles
     set balance = balance - v_fee
   where id = v_uid;

  begin
    insert into public.match_registrations (tournament_id, user_id, ff_uid, ign, status)
    values (p_tournament_id, v_uid, p_ff_uid, p_ign, 'joined');
  exception
    when unique_violation then
      -- balance already deducted above: refund before reporting the duplicate
      update public.profiles set balance = balance + v_fee where id = v_uid;
      return json_build_object('error', 'Already joined', 'code', '23505');
  end;

  update public.tournaments
     set current_players = current_players + 1
   where id = p_tournament_id;

  -- Ledger entry, checked (the current API ignores this failure — AUDIT P0-6)
  insert into public.transactions (user_id, type, amount, status)
  values (v_uid, 'join', v_fee, 'completed');

  return json_build_object('success', true);
end;
$$;

revoke all on function public.join_tournament(uuid, text, text) from public, anon;
grant execute on function public.join_tournament(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_room_details — room credentials only for registered participants
-- [recommended, closes AUDIT P0-3 together with 004 and a client change]
-- ---------------------------------------------------------------------------
create or replace function public.get_room_details(p_tournament_id uuid)
returns table (room_id text, room_password text)
language sql
security definer
set search_path = public
stable
as $$
  select t.room_id, t.room_password
  from public.tournaments t
  where t.id = p_tournament_id
    and exists (
      select 1 from public.match_registrations r
      where r.tournament_id = p_tournament_id
        and r.user_id = auth.uid()
    );
$$;

revoke all on function public.get_room_details(uuid) from public, anon;
grant execute on function public.get_room_details(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. sync_current_players — AFTER INSERT/DELETE trigger on match_registrations
-- [recommended, defense in depth] Keeps current_players truthful for any
-- write path that does not go through join_tournament() (e.g. admin manual
-- inserts). Note: the API's current recount logic (joinTournament.js:100-112)
-- becomes unnecessary once the RPC is adopted.
-- ---------------------------------------------------------------------------
create or replace function public.sync_current_players()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.tournaments
       set current_players = current_players + 1
     where id = new.tournament_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.tournaments
       set current_players = greatest(current_players - 1, 0)
     where id = old.tournament_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_current_players_trg on public.match_registrations;
create trigger sync_current_players_trg
  after insert or delete on public.match_registrations
  for each row execute function public.sync_current_players();

-- IMPORTANT (DB phase checklist): if this trigger is applied, the
-- join_tournament() function above must NOT also bump current_players
-- manually (double counting). Before applying, delete the
-- "update public.tournaments set current_players = current_players + 1"
-- statement from join_tournament, OR skip this trigger. Exactly one of the
-- two paths must be live. Default choice for the DB phase: keep the manual
-- bump inside join_tournament and skip trigger #4.
-- The trigger is created here for completeness; drop it explicitly if the
-- manual-bump path is chosen:
--   drop trigger if exists sync_current_players_trg on public.match_registrations;

-- End of 003. Nothing in this file has been executed anywhere.
