-- ============================================================================
-- NOT APPLIED. For the database phase.
-- 005_wallet_requests.sql
-- Deposit / withdraw REQUESTS (no payment gateway): a user asks, an admin
-- approves or rejects, and ONLY the approve function touches money.
--
-- Why this shape (permanent rules 2, 3, 4):
--   * users can never write a balance or a status: `wallet_requests` grants
--     them INSERT + SELECT of their OWN rows and nothing else. There is no
--     UPDATE policy for clients at all — status changes happen exclusively in
--     approve_wallet_request() / reject_wallet_request(), which are
--     SECURITY DEFINER and granted to service_role ONLY;
--   * approve/reject are called by api/admin.js (service-role client) with the
--     admin id it verified from the caller's token, so nothing depends on
--     auth.uid() and no browser can call them;
--   * amounts are validated in the app layer (positive, sane maximum) AND
--     constrained here;
--   * a request row is the audit trail: who asked, how much, why, who decided.
--
-- Idempotent: create-if-not-exists / create-or-replace / drop-if-exists.
-- Companion docs: docs/DB_REQUIREMENTS.md §1.5, §2.5, §3.4, §3.5.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preconditions (verify BEFORE running anything below)
-- ---------------------------------------------------------------------------
--   select to_regclass('public.profiles');                      -- must exist
--   select conname from pg_constraint                           -- balance >= 0
--     where conname = 'profiles_balance_nonnegative_check';      -- recommended
--   select to_regclass('public.transactions');                  -- must exist
-- Expect: profiles = 'public.profiles' (not null), transactions = 'public.transactions'.
-- If profiles/transactions are missing, apply 001 first.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,                  -- 'deposit' | 'withdraw'
  amount      numeric(12,2) not null,
  reference   text,                           -- UPI ref / txn id stated by the user
  note        text,                           -- user's own note
  status      text not null default 'pending',-- 'pending' | 'approved' | 'rejected'
  admin_note  text,                           -- decision note from the admin
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.wallet_requests is
  'User deposit/withdraw requests. Money moves ONLY in approve_wallet_request(); status is never client-writable.';

-- Missing-column guard for a pre-existing table
do $$
begin
  if to_regclass('public.wallet_requests') is not null then
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='wallet_requests' and column_name='reference')
      then alter table public.wallet_requests add column reference text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='wallet_requests' and column_name='note')
      then alter table public.wallet_requests add column note text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='wallet_requests' and column_name='admin_note')
      then alter table public.wallet_requests add column admin_note text; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='wallet_requests' and column_name='reviewed_by')
      then alter table public.wallet_requests add column reviewed_by uuid references public.profiles (id) on delete set null; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='wallet_requests' and column_name='reviewed_at')
      then alter table public.wallet_requests add column reviewed_at timestamptz; end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Constraints (NOT VALID so a legacy table can never block the migration;
--    run VALIDATE CONSTRAINT once the data is known clean)
-- ---------------------------------------------------------------------------
do $$
begin
  -- amount must be positive and sane (app layer caps at 50,000 per request)
  if not exists (select 1 from pg_constraint where conname = 'wallet_requests_amount_check') then
    alter table public.wallet_requests
      add constraint wallet_requests_amount_check
      check (amount > 0 and amount <= 50000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'wallet_requests_type_check') then
    alter table public.wallet_requests
      add constraint wallet_requests_type_check
      check (type in ('deposit','withdraw')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'wallet_requests_status_check') then
    alter table public.wallet_requests
      add constraint wallet_requests_status_check
      check (status in ('pending','approved','rejected')) not valid;
  end if;

  -- a decision must always carry who and when; a pending row must carry neither
  if not exists (select 1 from pg_constraint where conname = 'wallet_requests_decision_check') then
    alter table public.wallet_requests
      add constraint wallet_requests_decision_check
      check (
        (status = 'pending'  and reviewed_at is null and reviewed_by is null)
        or
        (status <> 'pending' and reviewed_at is not null and reviewed_by is not null)
      ) not valid;
  end if;
end $$;

create index if not exists wallet_requests_user_created_idx
  on public.wallet_requests (user_id, created_at desc);
create index if not exists wallet_requests_status_created_idx
  on public.wallet_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. RLS — users may create and read their OWN requests; nobody may update or
--    delete them from a client session.
-- ---------------------------------------------------------------------------
alter table public.wallet_requests enable row level security;

-- INSERT: own row only, and always born 'pending' with no decision columns.
-- (Belt and braces: a WITH CHECK cannot inspect "old", so the status/default
--  values are forced by the column default + the check constraint above; the
--  WITH CHECK here stops a forged user_id.)
drop policy if exists wallet_requests_insert_own on public.wallet_requests;
create policy wallet_requests_insert_own on public.wallet_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

-- SELECT: own rows only.
drop policy if exists wallet_requests_select_own on public.wallet_requests;
create policy wallet_requests_select_own on public.wallet_requests
  for select to authenticated
  using (user_id = auth.uid());

-- NO update policy and NO delete policy on purpose: clients cannot change a
-- status, an amount or a decision. The service role (api/*) bypasses RLS and
-- is the only writer of decisions.

-- ---------------------------------------------------------------------------
-- 4. approve_wallet_request — the ONLY place money moves for a request
--    [closes the "fake success" risk: the caller gets a real json verdict]
--
-- Called by api/admin.js (service-role client) with the admin id it verified
-- from the caller's Authorization token — hence the explicit p_admin_id
-- parameter. auth.uid() is deliberately NOT used (service-role sessions have
-- no JWT; same reasoning as join_tournament in 003).
-- ---------------------------------------------------------------------------
create or replace function public.approve_wallet_request(
  p_request_id uuid,
  p_admin_id   uuid,
  p_admin_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req      public.wallet_requests;
  v_balance  numeric(12,2);
begin
  if p_admin_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Lock the request: the status check and the decision share one lock, so two
  -- admins clicking approve at the same time cannot double-credit.
  select * into v_req
  from public.wallet_requests
  where id = p_request_id
  for update;

  if not found then
    return json_build_object('error', 'Request not found');
  end if;
  if v_req.status = 'approved' then
    return json_build_object('error', 'Request already approved');   -- idempotent
  end if;
  if v_req.status = 'rejected' then
    return json_build_object('error', 'Request already rejected');
  end if;

  if v_req.type = 'deposit' then
    -- credit
    update public.profiles
       set balance = balance + v_req.amount
     where id = v_req.user_id;
    if not found then
      return json_build_object('error', 'Profile not found');
    end if;

    insert into public.transactions (user_id, type, amount, status)
    values (v_req.user_id, 'deposit', v_req.amount, 'completed');

  elsif v_req.type = 'withdraw' then
    -- debit: believe only the locked row in profiles, never a client figure
    select balance into v_balance
    from public.profiles
    where id = v_req.user_id
    for update;

    if not found then
      return json_build_object('error', 'Profile not found');
    end if;
    if v_balance < v_req.amount then
      -- Nothing is written: the admin must reject (or the user re-requests).
      return json_build_object('error', 'Insufficient balance at approval time');
    end if;

    update public.profiles
       set balance = balance - v_req.amount
     where id = v_req.user_id;

    insert into public.transactions (user_id, type, amount, status)
    values (v_req.user_id, 'withdraw', v_req.amount, 'completed');
  else
    return json_build_object('error', 'Unknown request type');
  end if;

  update public.wallet_requests
     set status      = 'approved',
         admin_note  = nullif(trim(coalesce(p_admin_note, '')), ''),
         reviewed_by = p_admin_id,
         reviewed_at = now()
   where id = p_request_id;

  return json_build_object('success', true, 'amount', v_req.amount, 'type', v_req.type);
end;
$$;

create or replace function public.reject_wallet_request(
  p_request_id uuid,
  p_admin_id   uuid,
  p_admin_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.wallet_requests;
begin
  if p_admin_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  select * into v_req
  from public.wallet_requests
  where id = p_request_id
  for update;

  if not found then
    return json_build_object('error', 'Request not found');
  end if;
  if v_req.status = 'rejected' then
    return json_build_object('error', 'Request already rejected');   -- idempotent
  end if;
  if v_req.status = 'approved' then
    -- Money already moved — a rejection must never silently undo it.
    return json_build_object('error', 'Request already approved and cannot be rejected');
  end if;

  update public.wallet_requests
     set status      = 'rejected',
         admin_note  = nullif(trim(coalesce(p_admin_note, '')), ''),
         reviewed_by = p_admin_id,
         reviewed_at = now()
   where id = p_request_id;

  return json_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants — service_role ONLY. The browser has no path to money movement.
-- ---------------------------------------------------------------------------
revoke all on function public.approve_wallet_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_wallet_request(uuid, uuid, text)  from public, anon, authenticated;
grant execute on function public.approve_wallet_request(uuid, uuid, text) to service_role;
grant execute on function public.reject_wallet_request(uuid, uuid, text)  to service_role;

-- ============================================================================
-- 6. VERIFICATION QUERIES (run after applying; each must return the expected
--    result before the feature flag is switched on)
-- ============================================================================
--   -- a) table + columns
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='wallet_requests';    -- expect 11
--
--   -- b) constraints present
--   select conname from pg_constraint
--    where conrelid = 'public.wallet_requests'::regclass
--    order by conname;
--   -- expect wallet_requests_amount_check, _decision_check, _pkey, _status_check, _type_check
--
--   -- c) RLS on, exactly two policies, both for `authenticated`
--   select relrowsecurity from pg_class where oid = 'public.wallet_requests'::regclass;   -- true
--   select policyname, cmd, roles from pg_policies
--    where tablename = 'wallet_requests' order by policyname;
--   -- expect wallet_requests_insert_own (INSERT), wallet_requests_select_own (SELECT)
--
--   -- d) functions exist with the expected grants
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          coalesce(array_to_string(p.proacl, ' | '), 'default') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('approve_wallet_request','reject_wallet_request');
--   -- expect both rows to show acl entries for service_role only (no anon/authenticated)
--
--   -- e) an authenticated user cannot see someone else's requests
--   --    (run as the user's JWT through PostgREST):
--   --    GET /rest/v1/wallet_requests?select=*   -> only rows with user_id = auth.uid()
--   --    PATCH /rest/v1/wallet_requests?id=eq.<any> -> 0 rows / 401 (no update policy)
--
--   -- f) the money path is atomic (run in a transaction, then ROLLBACK):
--   --    begin;
--   --      select public.approve_wallet_request('<pending-deposit-uuid>',
--   --        '<admin-uuid>', 'verified');
--   --      select balance, (select status from public.wallet_requests where id='<uuid>')
--   --        from public.profiles where id = '<user-uuid>';  -- credited + approved
--   --    rollback;
--
-- 7. ROLLBACK NOTES
--    drop function if exists public.approve_wallet_request(uuid, uuid, text);
--    drop function if exists public.reject_wallet_request(uuid, uuid, text);
--    drop policy if exists wallet_requests_insert_own on public.wallet_requests;
--    drop policy if exists wallet_requests_select_own on public.wallet_requests;
--    -- keep the table until the data is exported (it is the only record of the
--    -- requests users made):
--    --   \copy (select * from public.wallet_requests) to 'wallet_requests_backup.csv' csv header
--    -- then, only if empty or exported:
--    -- drop table if exists public.wallet_requests;
--    Rollback is safe only while no request has been approved-and-refunded:
--    approved rows also wrote `transactions` entries, which are NOT deleted by
--    the statements above (that ledger is append-only by design).
-- ============================================================================
-- End of 005. Nothing in this file has been executed anywhere.
