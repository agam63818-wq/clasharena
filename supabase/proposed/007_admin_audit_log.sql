-- ============================================================================
-- NOT APPLIED. For the database phase.
-- 007_admin_audit_log.sql
-- admin_audit_log — an append-only record of every privileged action the
-- admin router performs (api/admin.js): tournament create/update/cancel,
-- wallet-request approve/reject. Permanent rule 3 says admin checks happen
-- server-side; this table is how the server proves what it did, who did it and
-- why.
--
-- Why this shape:
--   * the app writes it with the service role, so there are NO client
--     policies at all — no insert, no update, no delete, no select;
--   * it is a log, not a queue: nothing in the app depends on a row being
--     there. api/admin.js writes best-effort, logs a server-side warning when
--     the table is missing, and tells the client `auditLogged: false` instead
--     of pretending the write happened;
--   * details is jsonb so new actions can add fields without a migration.
--
-- Idempotent: create-if-not-exists throughout.
-- Companion docs: docs/DB_REQUIREMENTS.md §1.6, §2.6.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------
--   select to_regclass('public.profiles');   -- must exist (admin_id FK)

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,        -- createTournament | updateTournament |
                                    -- cancelTournament | cancel_tournament_with_refund |
                                    -- approveWalletRequest | rejectWalletRequest
  target_type text not null,        -- 'tournament' | 'wallet_request'
  target_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Append-only admin action log. Service-role writes only; no client policies exist.';

do $$
begin
  if to_regclass('public.admin_audit_log') is not null then
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='admin_audit_log' and column_name='details')
      then alter table public.admin_audit_log add column details jsonb not null default '{}'::jsonb; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='admin_audit_log' and column_name='target_id')
      then alter table public.admin_audit_log add column target_id uuid; end if;
  end if;
end $$;

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — enabled with ZERO policies: nothing but the service role can read
--    or write this table (service role bypasses RLS).
-- ---------------------------------------------------------------------------
alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_no_client_access on public.admin_audit_log;
-- (No policy is created. The drop above is only there to remove a policy if an
--  earlier draft of this table had one.)

-- ============================================================================
-- 3. VERIFICATION QUERIES (after applying)
-- ============================================================================
--   -- a) RLS on, no policies
--   select relrowsecurity from pg_class where oid = 'public.admin_audit_log'::regclass;  -- true
--   select count(*) from pg_policies where tablename = 'admin_audit_log';                -- 0
--
--   -- b) a browser client cannot read it (run with a user JWT via PostgREST):
--   --    GET /rest/v1/admin_audit_log?select=*   -> [] (RLS denies everything)
--
--   -- c) after an admin action in the app:
--   select action, target_type, target_id, admin_id, details, created_at
--     from public.admin_audit_log order by created_at desc limit 10;
--   -- expect one row per action, e.g.
--   --   cancelTournament | tournament | <uuid> | <admin uuid> | {"refunded": 4}
--
-- 4. ROLLBACK NOTES
--    drop table if exists public.admin_audit_log;
--    This deletes the audit history — export it first:
--      \copy (select * from public.admin_audit_log) to 'admin_audit_log_backup.csv' csv header
--    Dropping the table is safe for the app: api/admin.js treats a missing
--    audit log as "not logged" (auditLogged: false) and never fails an action
--    because of it.
-- ============================================================================
-- End of 007. Nothing in this file has been executed anywhere.
