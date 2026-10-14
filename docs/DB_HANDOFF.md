# Database handoff — applying the proposed schema to Supabase

**Status of this repository: nothing in `supabase/proposed/` has ever been
executed.** Every file in it is header-stamped *"NOT APPLIED. For the database
phase."* This document is the ordered runbook for the person who owns the
Supabase project to apply them safely, then switch the feature flags on one at a
time.

Read alongside: [DB_REQUIREMENTS.md](DB_REQUIREMENTS.md) (what the code needs and
why) · [AUDIT.md](AUDIT.md) (the findings each file closes) ·
[SMOKE_TEST.md](SMOKE_TEST.md) (the manual checks after each flag flip) ·
[DEPLOYMENT.md](DEPLOYMENT.md) (env vars and redeploys).

Audience: the project owner (or a DBA acting for them). Everything here is
written to be run by hand in the Supabase SQL editor. Nothing is automated, and
nothing should be.

---

## 0. Ground rules

1. **This is a live-money-adjacent database.** Balances and the `transactions`
   ledger are the record of what users own. There is no "just re-run it" for a
   bad refund.
2. **Nobody pastes credentials into chat, a ticket, a screenshot or this repo.**
   Use the Supabase dashboard or an environment variable (`DATABASE_URL`,
   exported in your own shell). Permanent rule 1 applies to humans too.
3. **Rehearse on a copy first.** Supabase: *Project → Settings → General →
   Duplicate project* (or restore a backup into a new project). Apply the whole
   runbook to the copy, run the smoke tests against a staging deployment, and
   only then repeat it on production.
4. **Read-only queries first** (§2). Every one of them is a `select`. Record the
   output — the pre-state is the only proof you have of what a migration changed.
5. **One file at a time, wrapped in a transaction.** The SQL editor runs a script
   as a single implicit transaction; keep it that way, and check the notices
   (`raise notice`) before moving on. Never paste two files into one run.
6. **SQL first, flags later.** The schema can be applied with every flag off —
   unused tables and functions change nothing about the running app. Flipping a
   flag is a separate deploy, §6. The two exceptions that change behaviour the
   moment they are applied are called out in §3: **002 (RLS goes live)** and
   **004 Part B (do not apply yet)**.
7. Nothing here confirms the plan is safe for your specific data. If a
   precondition query in §2 returns anything unexpected, **stop** and resolve it
   first (deduplicate, reconcile, decide) rather than pushing a constraint
   through it.

## 1. Backup first (do this before anything else)

Three independent layers, cheapest first:

1. **Dashboard backup.** Supabase → *Database → Backups*. On paid plans take a
   manual backup / confirm daily backups are green and PITR (if enabled) covers
   the last 24 h. Note the timestamp.
2. **Logical dump** (portable, and the thing you can actually inspect):

   ```bash
   # DATABASE_URL = the "Connection string → URI" from Project Settings → Database
   pg_dump --schema=public --no-owner --no-privileges "$DATABASE_URL" \
     > clasharena_before_dbphase_$(date +%Y%m%d_%H%M).sql
   ```

   Also export the two tables that hold irreplaceable user intent:

   ```bash
   psql "$DATABASE_URL" -c "\copy (select * from public.transactions) to 'transactions.csv' csv header"
   psql "$DATABASE_URL" -c "\copy (select * from public.profiles) to 'profiles.csv' csv header"
   ```

3. **Rehearsal project** (§0.3). Restore the dump there and apply the runbook to
   it first.

Keep the dump **outside** this repository (it contains personal data and must
never be committed — permanent rule 1). Confirm the file is non-empty and that
you can list its tables (`grep -c "CREATE TABLE" file.sql`) before trusting it.

## 2. Preconditions — read-only queries, run all of them

Run these against the target database **before** applying anything. Each has an
expected result; the "if it fails" column is the action, not a suggestion.

### 2.1 Structural preconditions (block 001)

```sql
-- a) Do the tables exist yet, and which columns are missing?
select table_name from information_schema.tables
 where table_schema = 'public' order by 1;              -- expect the 4 app tables (001 creates what is missing)

-- b) Orphan rows break the FOREIGN KEYs that 001 §6 adds unconditionally.
--    Any non-zero count makes 001 error out — clean up first.
select count(*) as orphan_registrations
  from public.match_registrations r
 where not exists (select 1 from public.tournaments t where t.id = r.tournament_id)
    or not exists (select 1 from auth.users u where u.id = r.user_id);

select count(*) as orphan_transactions
  from public.transactions t
 where not exists (select 1 from auth.users u where u.id = t.user_id);

-- c) Auth users without a profile row (the signup orphan window, audit P1-5)
select count(*) as users_without_profile
  from auth.users u left join public.profiles p on p.id = u.id
 where p.id is null;

-- d) Constraints 001 §5 tries to add (all NOT VALID, so legacy rows cannot block them)
select conname, convalidated from pg_constraint
 where conrelid in ('public.profiles'::regclass, 'public.tournaments'::regclass,
                    'public.transactions'::regclass, 'public.match_registrations'::regclass)
 order by 1;
```

| Result | Meaning | Action |
|---|---|---|
| 2.1b non-zero | FK creation will fail | delete/repair the orphan rows (take a copy first) |
| 2.1c non-zero | users exist who cannot use the app | backfill `profiles` rows or delete the auth users, deliberately |
| 2.1d missing `*_check` rows | constraints not yet added | expected on a fresh DB; 001 adds them `NOT VALID` |
| `notvalid = true` after 001 | constraint exists but legacy rows are exempt | run the matching §2.2/§2.3 query; decide whether to `validate constraint` later |

### 2.2 Integrity problems the constraints will *not* fix

These are the reported/frozen states the audit warned about (P0-6, P2-3). They do
not block a migration; they are the list you must reconcile before trusting your
own numbers.

```sql
-- a) Duplicate registrations: 001 §5a SKIPS its unique index (raise notice) while
--    any exist. Duplicates mean possible double charges.
select tournament_id, user_id, count(*) as rows
  from public.match_registrations
 group by 1, 2 having count(*) > 1
 order by 3 desc;

-- b) Negative balances: 001 adds check (balance >= 0) NOT VALID.
select id, username, balance from public.profiles where balance < 0 order by balance;

-- c) Player-count drift: current_players vs actual registrations.
select t.id, t.name, t.current_players, count(r.id) as actual
  from public.tournaments t
  left join public.match_registrations r on r.tournament_id = t.id
 group by t.id, t.name, t.current_players
having t.current_players <> count(r.id)
 order by t.created_at desc;

-- d) Duplicate usernames (case-insensitive): 001 §5b skips its unique index while any exist.
select lower(username) u, count(*), string_agg(id::text, ', ') as ids
  from public.profiles group by 1 having count(*) > 1;

-- e) Zero-amount transactions: 001 §5 adds check (amount <> 0) NOT VALID, so these
--    rows survive but the constraint cannot be validated until they are dealt with.
select count(*) as zero_amount_rows, min(created_at), max(created_at)
  from public.transactions where amount = 0;

-- f) Unknown transaction types (not in the signed-ledger convention — DB_REQUIREMENTS §1.4)
select type, count(*), min(amount) as min_amount, max(amount) as max_amount
  from public.transactions
 group by 1 order by 2 desc;

-- g) Balance vs ledger (the reconciliation that matters most).
--    abs() is used on purpose: today's join rows are stored POSITIVE while the
--    target convention is negative signed amounts (006 §1), so pre-existing data
--    may be either. Differences here are a work list, not automatically corruption.
select p.id, p.username, p.balance,
       coalesce(sum(case
         when t.type in ('join','withdraw')                then -abs(t.amount)
         when t.type in ('deposit','refund','prize')       then  abs(t.amount)
         else 0 end), 0) as ledger_net
  from public.profiles p
  left join public.transactions t on t.user_id = p.id
 group by p.id, p.username, p.balance
having p.balance <> coalesce(sum(case
         when t.type in ('join','withdraw')                then -abs(t.amount)
         when t.type in ('deposit','refund','prize')       then  abs(t.amount)
         else 0 end), 0)
 order by abs(p.balance) desc;
```

### 2.3 Preconditions specific to the later files

```sql
-- a) There must be at least one admin, and the value must be exactly 'admin':
--    every server-side admin gate (api/_lib/auth.js) and 002's is_admin() compare it.
select id, username, role from public.profiles where role = 'admin';

-- b) The tournament statuses actually in use — 006 §2 REPLACES the status check
--    constraint to allow 'cancelled'. If the query below lists a value outside
--    ('registration','upcoming','live','completed','cancelled'), the replacement
--    constraint cannot be created and must be agreed on first.
select status, count(*) from public.tournaments group by 1 order by 2 desc;

-- c) The existing status constraint definition (replaced by 006 §2).
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.tournaments'::regclass and contype = 'c';

-- d) 005 needs profiles + transactions (its FK target and the ledger it credits).
select to_regclass('public.profiles')     as profiles,
       to_regclass('public.transactions') as transactions,
       to_regclass('public.wallet_requests') as wallet_requests_should_be_null;

-- e) Current RLS state (002 turns it on; a partially-RLS database needs review
--    before, not after).
select relname, relrowsecurity
  from pg_class
 where relname in ('profiles','tournaments','match_registrations','transactions',
                   'wallet_requests','admin_audit_log','tournament_room_credentials');
```

**The one decision to make before 005/006:** which ledger convention wins
(`006` §1, `DB_REQUIREMENTS.md` §1.4). Either (a) migrate historical `join` rows
to negative amounts and have every writer store signed values, or (b) keep
amounts unsigned and always map the sign from `type`. `src/lib/transactions.js`
already handles both, with unit tests. Query 2.2f tells you what data you have;
pick one and record the decision in the PR that flips the flags.

## 3. Apply order

Apply **one file per run**, in this order. `begin;` / the SQL editor's implicit
transaction is fine; if the editor reports an error, nothing in that run applied
— read the message, fix the data, re-run the same file (every file is
idempotent and precondition-checked).

| # | File | What it creates | Changes live behaviour immediately? |
|---|---|---|---|
| 1 | `001_tables_constraints.sql` | missing tables, columns, CHECK constraints (`NOT VALID`), unique indexes, FKs, plain indexes | No — additive only. Watch the `raise notice` lines: they tell you which unique indexes were **skipped** because of duplicates |
| 2 | `002_rls_policies.sql` | `is_admin()`, RLS enabled on the 4 tables, policies per DB_REQUIREMENTS §2 | **Yes — RLS goes live.** See the warning below |
| 3 | `003_functions_triggers.sql` | `protect_profiles_columns` trigger, `join_tournament()` (service_role only), `get_room_details()` (authenticated), `sync_current_players` trigger | Partly — the triggers are active immediately; the RPCs only matter once their flags are on |
| 4 | `004_room_credentials_split.sql` | **Part A only**: `tournament_room_credentials` + one-time copy | No. **Part B is commented out and must stay commented out until the coordinated client change ships** (see below) |
| 5 | `005_wallet_requests.sql` | `wallet_requests`, its constraints/RLS, `approve_wallet_request()`, `reject_wallet_request()` (service_role only) | No — the flow is still behind `ENABLE_WALLET_REQUESTS` |
| 6 | `006_cancel_tournament_refunds.sql` | the signed-ledger decision, replacement `tournaments_status_check` allowing `'cancelled'`, `cancel_tournament_with_refund()` | No — behind `ENABLE_TOURNAMENT_CANCELLATION` |
| 7 | `007_admin_audit_log.sql` | `admin_audit_log` (RLS on, zero policies) | No — it is a best-effort log |

Apply 4–7 **before** flipping their flags; that is the whole point of the
SQL-first/flag-later split. 002 and 003 can also be applied ahead of the flags —
they are what the *legacy* paths start relying on for authorization.

### Warning A — 002 makes RLS the real gate for browser traffic

Today the anon key can do whatever a policy-less table allows, so RLS is the
single most consequential file here. Before running it, be sure that:

- the signup path can still insert its own `profiles` row (`profiles_insert_self`),
- profile editing still works (`profiles_update_self`, further narrowed by 003's
  trigger to `ff_id`/`nickname`/`avatar_url`),
- the admin list joins against `profiles` (`profiles_select_admin`),
- the *client-side* admin create/edit still passes `is_admin()` — which is only
  true if that user's `profiles.role` is exactly `'admin'` (§2.3a).

If any of those is wrong, the app degrades in front of users. That is why §6
puts a smoke test after this file, before any flag.

### Warning B — 004 Part B breaks the room reveal if applied early

`004`'s Part B (`REVOKE SELECT` on `tournaments` + column grants) makes
`select('*')` fail, and today's client fetches tournaments with `select('*')`.
Apply Part B **only in the same release** as the client that sets
`VITE_FEATURE_ROOM_RPC=true` — the flag is exactly what switches the client to
the RPC path and off `select('*')` (`src/config/features.js` → `roomDetailsRpc`).
Until then the audit gap P0-3 stays open and is documented as such: after 002
alone, any signed-in user can still read `room_id`/`room_password`.

### Warning C — 006 §1 is a decision, not a migration step

The file restates the signed-ledger convention and gives you the two options. Do
not skip that section: `cancel_tournament_with_refund()` writes **positive**
`refund` rows under the signed convention, and the wallet UI's sign mapping must
agree with whatever historical data you keep (§2.3 decision).

## 4. Verification after each file

Run the checks that belong to the file you just applied. The per-file
verification sections carry the precise expectations:

| After | Run | Expect |
|---|---|---|
| 001 | §2.1d again, plus `select indexname from pg_indexes where schemaname='public' order by 1;` | every constraint present (`notvalid` is fine), every unique index present **unless** the notices said it was skipped |
| 002 | §2.3e (all four `relrowsecurity = true`), `select tablename, policyname, cmd, roles from pg_policies where schemaname='public' order by 1,2;` | RLS on; the policies listed in `DB_REQUIREMENTS.md` §2; nothing writable by clients on `transactions`/`match_registrations` |
| 003 | `005`-style ACL check below, and the trigger list | see next rows |
| 004 | `select count(*) from public.tournament_room_credentials;` vs a count of tournaments with credentials | copy complete, Part B still commented out |
| 005 | `005` §6 a–f | table + 11 columns, 5 constraints, 2 policies, both functions granted to `service_role` **only** |
| 006 | `006` §4 a–c | status constraint allows `'cancelled'`; the refund RPC's ACL is `service_role` only; the dry run inside `begin; … rollback;` refunds exactly once |
| 007 | `007` §3 | table exists, RLS on, **zero** policies |

The authorization checks that matter most, in one block:

```sql
-- The money paths must be unreachable from the browser.
select has_function_privilege('anon',          'public.approve_wallet_request(uuid,uuid,text)',      'execute') as anon_approve,        -- false
       has_function_privilege('authenticated', 'public.approve_wallet_request(uuid,uuid,text)',      'execute') as user_approve,        -- false
       has_function_privilege('anon',          'public.reject_wallet_request(uuid,uuid,text)',       'execute') as anon_reject,         -- false
       has_function_privilege('authenticated', 'public.reject_wallet_request(uuid,uuid,text)',       'execute') as user_reject,         -- false
       has_function_privilege('anon',          'public.cancel_tournament_with_refund(uuid,uuid,text)','execute') as anon_cancel,        -- false
       has_function_privilege('authenticated', 'public.cancel_tournament_with_refund(uuid,uuid,text)','execute') as user_cancel,        -- false
       has_function_privilege('anon',          'public.join_tournament(uuid,uuid,text,text)',        'execute') as anon_join,           -- false
       has_function_privilege('authenticated', 'public.join_tournament(uuid,uuid,text,text)',        'execute') as user_join,           -- false
       has_function_privilege('service_role',  'public.join_tournament(uuid,uuid,text,text)',        'execute') as service_join;        -- true
```

Any `true` in an `anon`/`authenticated` column is a **stop-everything** finding:
those functions move money without RLS. Fix the grants before flipping any flag.

Client-side proof, through the anon key (PostgREST), while signed in as a normal
user:

- `GET /rest/v1/wallet_requests?select=*` → only your own rows.
- `PATCH /rest/v1/wallet_requests?id=eq.<any>` → 0 rows / denied (there is no
  update policy, by design).
- `GET /rest/v1/transactions?select=*` → only your own rows (closes audit P0-5).
- `POST /rest/v1/match_registrations` → denied (no insert policy; joins go
  through the API).

## 5. Rollback

Every file has its own rollback notes in its §5/§7 section; they are the
authoritative list. Two rules on top of them:

- **The ledger is append-only.** Rolling back a function or a policy never
  deletes `transactions` rows, and it must not: if a refund was written, undo it
  with a **compensating entry** (an explicit, audited correction), never by
  editing a balance or deleting a row by hand.
- **Never drop data to undo code.** `wallet_requests`, `admin_audit_log` and
  `tournament_room_credentials` hold records nothing else can reconstruct —
  export them (`\copy`, as in §1) before any `drop table`.

The fast, non-destructive rollback for every new feature is the flag itself:

| Problem after flipping a flag | Do this (no SQL) |
|---|---|
| Wallet requests misbehaving | `ENABLE_WALLET_REQUESTS=false` + redeploy → every wallet action answers 503 and no money can move |
| Cancellation refunds wrong | `ENABLE_TOURNAMENT_CANCELLATION=false` + redeploy → 409 with the reason, nothing changes |
| RPC join misbehaving | `JOIN_USE_RPC=false` + redeploy → legacy path returns |
| Room credentials wrong | `VITE_FEATURE_ROOM_RPC=false` + rebuild (client flag) → legacy reveal returns |
| App-wide incident | Vercel → promote the previous deployment (DEPLOYMENT.md §8) |

Schema-level rollback is the last resort, and only after the matching data is
exported: drop the functions/policies/tables per the file's own notes, and leave
`001`'s constraints in place unless you deliberately want to lose them.

## 6. Flag-on order

Prerequisite for this section: the smoke test in
[SMOKE_TEST.md](SMOKE_TEST.md) §0–§3 has passed on the deployed staging
environment with everything off, so you know the app works before any flag
gives it new powers.

One flag per deploy, smoke test after each, stop at the first failure and turn
the flag back off (that is what the kill switches are for). Environment changes
need a redeploy — [DEPLOYMENT.md](DEPLOYMENT.md) §4.

| Step | Flag(s) to set, then redeploy | Needs (already applied, verified) | Smoke test to run | Roll back by |
|---|---|---|---|---|
| 0 | none (baseline) | 001 + 002 | SMOKE_TEST §1–§3 (legacy join), §4.1–4.4, §5.3–5.5, §6.8, §8.6 | — |
| 1 | `JOIN_USE_RPC=true` | 003 §2 | SMOKE_TEST §3.8 + §7.2, and §7.3 if you want to see the honest failure mode | `JOIN_USE_RPC=false` |
| 2 | `VITE_FEATURE_ROOM_RPC=true` | 003 §3 (+ 004 Part A) | SMOKE_TEST §2.6 + §7.4 | `VITE_FEATURE_ROOM_RPC=false` |
| 3 | `ENABLE_TOURNAMENT_CANCELLATION=true` | 006 | SMOKE_TEST §5.6–5.11 + §7.8/§7.9 (verify a refund lands **exactly once**) | `ENABLE_TOURNAMENT_CANCELLATION=false` |
| 4 | `ENABLE_WALLET_REQUESTS=true` **and** `VITE_FEATURE_WALLET_REQUESTS=true` (same release) | 005 (+ 007 for the audit trail) | SMOKE_TEST §4.5–4.12, §6.1–6.8, §7.5–7.7 | `ENABLE_WALLET_REQUESTS=false` |
| 5 | optionally 004 Part B, **same release as step 2's client** | 004 Part A + the client that no longer uses `select('*')` | SMOKE_TEST §2.4–2.6 again, plus §8.6 | re-grant select, or `VITE_FEATURE_ROOM_RPC=false` |
| — | `VITE_FEATURE_WALLET_TRANSACTIONS` | already on by default; needs 002 | SMOKE_TEST §4.1–4.3 (never more than your own rows) | set it to `false` |
| — | `VITE_FEATURE_PAYMENTS` | **never** — there is no payment gateway | — | — |
| — | `WALLET_REQUESTS_PER_HOUR` | optional, default 5 | SMOKE_TEST §4.10 | — |

Notes on the order:

- **Join RPC first** (step 1) because it closes the money-drift class of bugs
  (audit P0-6) on the flow users already use every day.
- **Cancellation before wallet requests** (step 3 before 4) so that refunds are
  proven working *before* the deposit/withdraw queue starts creating balances to
  refund.
- **The two wallet-request flags go out together.** Server on + client off is a
  hidden feature; client on + server off shows users a form that always answers
  503. Neither is a state to leave deployed.
- **Audit log (007) before step 3/4** if you want the paper trail from the first
  privileged action; it is not a flag, and `api/admin.js` reports
  `auditLogged: false` honestly until the table exists.

## 7. Sign-off

| Field | Value |
|---|---|
| Backup taken (timestamp, location) | |
| Rehearsal project used | |
| Preconditions run — any violations | |
| Ledger convention decided (006 §1) | |
| Files applied | |
| Verification queries run (sections) | |
| Flags flipped, in order, with deploy ids | |
| Smoke tests passed (sections) | |
| Open items / deferred (e.g. 004 Part B, constraint validation) | |

Until this table is filled in with real results, **do not describe the product as
production-ready** — not in a deck, not in a README, not in a conversation with
users.
