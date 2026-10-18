-- ============================================================================
-- NOT APPLIED. For the database phase.
-- OUTDATED - written for uuid ids.
-- The live database was changed separately; do not apply.
-- 006_cancel_tournament_refunds.sql
-- cancel_tournament_with_refund() — cancelling a tournament that has PAID
-- registrations, atomically: status + one refund per registration + one
-- ledger row per refund. Idempotent, service_role only, called by
-- api/admin.js (`cancelTournament`, flag ENABLE_TOURNAMENT_CANCELLATION).
--
-- Why this shape:
--   * refunding by looping from the client (or from a server route doing N
--     separate updates) can half-refund a field: money would be gone from
--     some wallets and not others with no way to resume. Everything below
--     happens in ONE transaction — either all refunds land or none do;
--   * idempotency comes from the request status/ledger, not from a client
--     flag: the second call sees status = 'cancelled' and refuses;
--   * the runner-up (plain cancel, no paid players) is a one-column UPDATE
--     performed by api/admin.js directly — no RPC needed.
--
-- Idempotent: create-if-not-exists / create-or-replace / drop-if-exists.
-- Companion docs: docs/DB_REQUIREMENTS.md §3.6, §4 and §5 (ledger convention).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preconditions (verify BEFORE running anything below)
-- ---------------------------------------------------------------------------
--   select to_regclass('public.tournaments');           -- must exist
--   select to_regclass('public.match_registrations');   -- must exist
--   select to_regclass('public.transactions');          -- must exist
--   select to_regclass('public.profiles');              -- must exist
--   -- the tournaments status constraint must allow 'cancelled' (see §2), and
--   -- the amount column of transactions must be able to hold a negative value
--   -- under the chosen ledger convention (see §1).

-- ---------------------------------------------------------------------------
-- 1. LEDGER CONVENTION (decide before applying — docs/DB_REQUIREMENTS.md §5)
--    Signed semantics, negative = money leaving the user's wallet:
--       join     -> -entry_fee
--       withdraw -> -amount
--       deposit  -> +amount
--       refund   -> +amount
--       prize    -> +amount
--    IMPORTANT: `join` rows written by 003's join_tournament()/the legacy API
--    are stored POSITIVE today, and the wallet UI currently derives the sign
--    from the row's `type` as an interim measure. Before switching to signed
--    values, decide one of:
--       (a) migrate old join rows to negative amounts and make every writer
--           (003 + 006) store signed values — the clean end state; or
--       (b) keep amounts unsigned and always derive the sign from `type`
--           everywhere (also acceptable; then every consumer must use the map
--           in src/lib/transactions.js rather than the sign of the number).
--    This file follows (a): refunds are written POSITIVE (+amount, type
--    'refund'), which is also what the interim UI sign map expects for
--    'refund', so both worlds agree for new rows.

-- ---------------------------------------------------------------------------
-- 2. tournaments.status must accept 'cancelled'
--    (001 declares the check without it; a database where 001 was already
--     applied gets the constraint replaced here.)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tournaments_status_check') then
    alter table public.tournaments drop constraint tournaments_status_check;
  end if;
  alter table public.tournaments
    add constraint tournaments_status_check
    check (status in ('registration','upcoming','live','completed','cancelled')) not valid;
end $$;

-- ---------------------------------------------------------------------------
-- 3. cancel_tournament_with_refund
--
-- Called by api/admin.js with the admin id it verified from the caller's
-- Authorization token — explicit p_admin_id, NOT auth.uid() (service-role
-- sessions have no JWT: same reasoning as 003/005).
--
-- Returns: {"success": true, "refunded": n, "already_cancelled": false}
--          {"error": "..."} on a refusal.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_tournament_with_refund(
  p_tournament_id uuid,
  p_admin_id      uuid,
  p_reason        text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament  public.tournaments;
  v_fee         numeric(12,2);
  v_reg         record;
  v_refunded    int := 0;
begin
  if p_admin_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Lock the tournament row: the status check and the whole refund share one
  -- lock, so two admins clicking cancel cannot refund twice.
  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    return json_build_object('error', 'Tournament not found');
  end if;

  if v_tournament.status = 'cancelled' then
    -- Idempotent: nothing to do, no second refund.
    return json_build_object('success', true, 'refunded', 0, 'already_cancelled', true);
  end if;
  if v_tournament.status = 'completed' then
    return json_build_object('error', 'This match is already completed and cannot be cancelled');
  end if;

  v_fee := coalesce(v_tournament.entry_fee, 0);

  -- Refund every registration that actually paid, once each. The ledger row
  -- is inserted per refund inside the same transaction.
  if v_fee > 0 then
    for v_reg in
      select r.user_id, r.id
      from public.match_registrations r
      where r.tournament_id = p_tournament_id
      order by r.user_id
      for update
    loop
      update public.profiles
         set balance = balance + v_fee
       where id = v_reg.user_id;

      if not found then
        -- A registration without a profile row: abort everything rather than
        -- silently refunding some players and not others.
        raise exception 'cancel_tournament_with_refund: registration % has no profile row', v_reg.id
          using errcode = 'P0002';
      end if;

      insert into public.transactions (user_id, type, amount, status)
      values (v_reg.user_id, 'refund', v_fee, 'completed');

      v_refunded := v_refunded + 1;
    end loop;
  end if;

  update public.tournaments
     set status = 'cancelled'
   where id = p_tournament_id;

  -- The reason is kept on the audit trail (007); include it here so a caller
  -- that only has this function still records why.
  begin
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
    values (p_admin_id, 'cancel_tournament_with_refund', 'tournament', p_tournament_id,
            jsonb_build_object('refunded', v_refunded, 'entry_fee', v_fee,
                               'reason', nullif(trim(coalesce(p_reason, '')), '')));
  exception
    when undefined_table then
      -- 007 not applied yet: cancelling must still work, the app logs it.
      null;
  end;

  return json_build_object('success', true, 'refunded', v_refunded, 'already_cancelled', false);
end;
$$;

revoke all on function public.cancel_tournament_with_refund(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_tournament_with_refund(uuid, uuid, text) to service_role;

-- ============================================================================
-- 4. VERIFICATION QUERIES (after applying)
-- ============================================================================
--   -- a) constraint accepts 'cancelled'
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'tournaments_status_check';
--   -- expect: CHECK ((status = ANY (ARRAY['registration','upcoming','live','completed','cancelled'])))
--
--   -- b) function + grants
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          coalesce(array_to_string(p.proacl,' | '),'default') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='cancel_tournament_with_refund';
--   -- expect args = 'uuid, uuid, text', acl = service_role only
--
--   -- c) dry run in a transaction (replace the uuids), then ROLLBACK:
--   --   begin;
--   --     select public.cancel_tournament_with_refund('<tournament-uuid>','<admin-uuid>','test');
--   --     select status from public.tournaments where id='<tournament-uuid>';   -- cancelled
--   --     select user_id, type, amount from public.transactions
--   --      where type='refund'
--   --        and created_at > now() - interval '1 minute';                        -- one per player
--   --     select public.cancel_tournament_with_refund('<tournament-uuid>','<admin-uuid>','again');
--   --     -- expect {"refunded": 0, "already_cancelled": true} and NO new rows
--   --   rollback;
--
-- 5. ROLLBACK NOTES
--    drop function if exists public.cancel_tournament_with_refund(uuid, uuid, text);
--    -- Restore the previous status constraint ONLY after confirming no row is
--    -- 'cancelled' (otherwise the ALTER fails and that is correct):
--    --   select count(*) from public.tournaments where status = 'cancelled';
--    --   alter table public.tournaments drop constraint tournaments_status_check;
--    --   alter table public.tournaments
--    --     add constraint tournaments_status_check
--    --     check (status in ('registration','upcoming','live','completed')) not valid;
--    Refunds already written by an approved cancellation are NOT reverted by
--    this rollback: `profiles.balance` and the `refund` ledger rows are the
--    record of money that really moved.
-- ============================================================================
-- End of 006. Nothing in this file has been executed anywhere.
