# ClashArena — Database Requirements

**Source of truth:** application code in this repo only. The live Supabase project was not inspected; this document states what the code *needs* the database to provide, and what it *should* provide for the audit findings (see `docs/AUDIT.md`) to be closed.

**Labels:**
- **[required by code]** — the app queries/writes this today; without it the feature is broken.
- **[recommended]** — not required for the current code to run, but required to close a P0/P1 audit finding or for production safety.

Proposed, **not applied** SQL lives in `supabase/proposed/` (each file header states this).

---

## 1. Tables and columns

### 1.1 `profiles`

| Column | Type (proposed) | Label | Used by (evidence) |
|---|---|---|---|
| `id` | `uuid` PK, = `auth.users.id` | [required by code] | `App.jsx:155` (insert with `data.user.id`), `:352` (`.eq('id', userId)`) |
| `username` | `text not null` | [required by code] | `App.jsx:156` (insert, defaults to email prefix), display `:839`, admin join `:1058` |
| `phone` | `text null` | [required by code] | `App.jsx:157` (insert) |
| `role` | `text not null default 'user'` | [required by code] | read `App.jsx:415` (`isAdmin`); **no longer written by the client** — signup stopped sending `role` (the value must come from this column default / the protection trigger); compared `'admin'` server-side in `api/_lib/auth.js` (`requireAdmin`) and `api/deleteTournament.js` |
| `balance` | `numeric(12,2) not null default 0` | [required by code] | read `App.jsx:408, 580`, `api/joinTournament.js:39–69`; written by API `api/joinTournament.js:72–75` |
| `level` | `int not null default 1` | [required by code] | `App.jsx:399`, `:844` (display only) |
| `wins` | `int not null default 0` | [required by code] | `App.jsx:864` (display only) |
| `ff_id` | `text` | [required by code] | `App.jsx:738, 766` (update), `:401` |
| `nickname` | `text` | [required by code] | `App.jsx:739, 767`, `:402` |
| `avatar_url` | `text` | [required by code] | `App.jsx:740, 768`, `:829` |
| `created_at` | `timestamptz not null default now()` | [recommended] | ordering not used on profiles; standard practice |

Notes:
- `balance` as exact `numeric` (not float) — the API does arithmetic on it (`api/joinTournament.js:69`). **[recommended]**
- The client reads profiles with `select('*')` (`App.jsx:352`) — fine because it is the user's own row; the *policy* must make it so (§2.1).

### 1.2 `tournaments`

| Column | Type (proposed) | Label | Used by (evidence) |
|---|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | [required by code] | referenced everywhere; `App.jsx:363` `.eq('id', ...)` |
| `name` | `text not null` | [required by code] | admin form `AdminView.jsx`; written server-side by `api/admin.js` `createTournament`/`updateTournament` (3–80 chars, validated there) |
| `mode` | `text not null default 'Solo'` | [required by code] | admin form `AdminView.jsx` (Solo/Duo/Squad/1v1) → server allow-list `api/_lib/validate.js` `TOURNAMENT_MODES`; display `App.jsx:546, 634` |
| `prize` | `numeric(12,2) not null default 0` | [required by code] | admin form → `api/admin.js` (>= 0); display `App.jsx:540, 622` |
| `entry_fee` | `numeric(12,2) not null default 0` | [required by code] | **must be the authoritative fee** — read server-side on every join: `api/joinTournament.js` (legacy path) and `join_tournament()` §3.1 (RPC path) derive the charge from this column, never from the client; admin write via `api/admin.js` (>= 0); display `App.jsx:547, 633, 647` |
| `max_players` | `int not null default 100` | [required by code] | admin form → `api/admin.js` (> 0 and never below the row's `current_players`); capacity checks `api/joinTournament.js`, `App.jsx:587` |
| `current_players` | `int not null default 0` | [required by code] | written only server-side (join path / `sync_current_players` trigger); **never writable through `api/admin.js`** (the column is not in the validated column set — AUDIT P2-1); display `App.jsx:542, 635` |
| `status` | `text not null default 'registration'` | [required by code] | admin form values `registration/upcoming/live` → `api/_lib/validate.js` `TOURNAMENT_STATUSES` + `assertStatusTransition` (server-side transition rules); also `'completed'` in `statusColor` `App.jsx:1166`; badge classes `:536, 620` |
| `match_time` | `timestamptz` | [required by code] | admin form writes `date.toISOString()`, re-validated + normalized to UTC ISO in `api/_lib/validate.js`; display `:543, 636, 1281` |
| `room_id` | `text` | [required by code] — but **read access must be restricted** (see §2.2) | set by the admin form → `api/admin.js`, revealed `App.jsx:653` |
| `room_password` | `text` | [required by code] — same restriction | same as `room_id`; `App.jsx:654` |
| `image_url` | `text` | [required by code] | admin form → `api/admin.js` (http(s) URL only); display `:534, 618` |
| `rules` | `text` | [required by code] | admin form → `api/admin.js` (<= 2000 chars); display `:641` |
| `created_at` | `timestamptz not null default now()` | [required by code] | ordering: `App.jsx:363` `.order('created_at', { ascending: false })` |

### 1.3 `match_registrations`

| Column | Type (proposed) | Label | Used by (evidence) |
|---|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | [required by code] | `App.jsx:571, 583` (`.select('id')`) |
| `tournament_id` | `uuid not null` FK → `tournaments.id` | [required by code] | `api/joinTournament.js:24–28, 84`, `api/deleteTournament.js:33`, `App.jsx:571, 1405–1416` |
| `user_id` | `uuid not null` FK → `auth.users.id` | [required by code] | `api/joinTournament.js:26, 86`, `App.jsx:572, 1418` |
| `ff_uid` | `text not null` | [required by code] | `api/joinTournament.js:15–18, 87`, admin list `App.jsx:1299` |
| `ign` | `text not null` | [required by code] | `api/joinTournament.js:16–18, 88`, admin list `App.jsx:1296` |
| `status` | `text not null default 'joined'` | [required by code] | write `'joined'` `api/joinTournament.js:89` (no read in UI today) |
| `created_at` | `timestamptz not null default now()` | [required by code] | ordering `App.jsx:1059` |

Constraints required:
- **UNIQUE (`tournament_id`, `user_id`)** — [required by code]: the API relies on catching Postgres `23505` for the duplicate-join path (`api/joinTournament.js:93–95`; client handles it at `App.jsx:596`). Without this constraint, duplicate joins and double charges are possible.
- FK to `tournaments` with `ON DELETE CASCADE` — [recommended]: `deleteTournament.js:32–44` deletes registrations first, then the tournament, in two non-transactional steps; a cascade (or better, a single delete RPC) removes the orphan window.
- FK to `auth.users` with `ON DELETE CASCADE` — [recommended] (profile deletion hygiene).

### 1.4 `transactions`

| Column | Type (proposed) | Label | Used by (evidence) |
|---|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | [required by code] | `App.jsx:704` (`tx.id` as key) |
| `user_id` | `uuid not null` FK → `auth.users.id` | [required by code] | insert `api/joinTournament.js:119–124` (no filter today — audit P0-5) |
| `type` | `text not null` | [required by code] | write `'join'` (`api/joinTournament.js:121`), display `App.jsx:707` |
| `amount` | `numeric(12,2) not null` | [required by code] | write `entryFee` (currently client-controlled — audit P0-1), display `App.jsx:708` |
| `status` | `text not null default 'completed'` | [required by code] | write `'completed'` (`api/joinTournament.js:123`) |
| `created_at` | `timestamptz not null default now()` | [required by code] | ordering `App.jsx:684`, display `:710` |

**Sign convention — settled for the DB phase [required before the wallet flags are switched on]** (audit P2-3, `supabase/proposed/006` §1):

| type | sign | who writes it |
|---|---|---|
| `join` | **−** `entry_fee` | `api/joinTournament.js` (legacy) / `join_tournament()` §3.1 |
| `withdraw` | **−** `amount` | `approve_wallet_request()` §3.4 |
| `deposit` | **+** `amount` | `approve_wallet_request()` §3.4 |
| `refund` | **+** `amount` | `cancel_tournament_with_refund()` §3.6 |
| `prize` | **+** `amount` | (no writer yet) |

Today's writers store joins **positive**, so the wallet derives the sign from the row's `type` as an interim measure (`src/lib/transactions.js`, with unit tests). Two acceptable end states, to be chosen before flipping `VITE_FEATURE_WALLET_TRANSACTIONS` on top of new data: (a) migrate historical joins to negative values and make every writer store signed amounts, or (b) keep amounts unsigned forever and always map by `type`. `src/lib/transactions.js` works for both. Also add `check (amount <> 0)`.

### 1.5 `wallet_requests` — **[required by code for the wallet-request flags]**
Created by `supabase/proposed/005_wallet_requests.sql` §1.

| Column | Type (proposed) | Label | Used by (evidence) |
|---|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | [required by code] | request keys in `WalletView`/`AdminView` |
| `user_id` | `uuid not null` FK → `profiles.id` on delete cascade | [required by code] | insert `api/wallet.js` (from the token); admin username lookup (`listWalletRequests`) |
| `type` | `text not null` + check in `('deposit','withdraw')` | [required by code] | `api/wallet.js` validation mirrors this; approve/reject branch on it |
| `amount` | `numeric(12,2) not null` + check `> 0 and <= 50000` | [required by code] | `api/wallet.js` (`MAX_REQUEST_AMOUNT`), §3.4 |
| `reference` | `text` (≤ 64 chars at the API) | [required by code] | user-stated UPI/txn reference (display only) |
| `note` | `text` (≤ 300) | [required by code] | user's own note |
| `status` | `text not null default 'pending'` + check in `('pending','approved','rejected')` | [required by code] | list badges; only the RPCs change it |
| `admin_note` | `text` | [required by code] | shown back to the user in `WalletView` |
| `reviewed_by` | `uuid` FK → `profiles.id` on delete set null | [required by code] | who decided |
| `reviewed_at` | `timestamptz` | [required by code] | when; paired with `reviewed_by` by a check constraint |
| `created_at` | `timestamptz not null default now()` | [required by code] | ordering + the rolling-hour rate limit |

Constraints: the `decision_check` enforces `(pending ⇒ no reviewer/timestamp)` and `(decided ⇒ both set)`. Indexes: `(user_id, created_at desc)` for the user's own list and the rate-limit count, `(status, created_at desc)` for the admin queue.

### 1.6 `admin_audit_log` — **[recommended, permanent rule 3's paper trail]**
Created by `supabase/proposed/007_admin_audit_log.sql`.

| Column | Type (proposed) | Label | Used by (evidence) |
|---|---|---|---|
| `id` | `uuid` PK | [required by code] | — |
| `admin_id` | `uuid` FK → `profiles.id` on delete set null | [required by code] | `api/_lib/audit.js` (the verified admin from the token) |
| `action` | `text not null` | [required by code] | `createTournament` / `updateTournament` / `cancelTournament` / `approveWalletRequest` / `rejectWalletRequest` |
| `target_type` | `text not null` | [required by code] | `'tournament'` or `'wallet_request'` |
| `target_id` | `uuid` | [required by code] | the affected row |
| `details` | `jsonb not null default '{}'` | [required by code] | e.g. `{"refunded": 4, "reason": "..."}` |
| `created_at` | `timestamptz not null default now()` | [required by code] | ordering |

The app writes it **best effort**: a missing table never fails an action, but the response carries `auditLogged: false` and the server logs a warning, so the gap is visible instead of implied.

---

## 2. Row Level Security

> The Supabase anon key is shipped to every browser (`src/lib/supabaseClient.js:6–7`), so **RLS is the only thing standing between any visitor and full read/write on these tables.** The service-role key used by `api/*` bypasses RLS entirely — every policy below is written for the `anon`/`authenticated` roles.

> ### ⚠️ OPEN DEPENDENCY — signup and profile edits still rely on RLS/trigger protection (DB phase)
> **The client can no longer be trusted with — and no longer sends — privilege-bearing columns, but the DB is still the only thing that can *refuse* them.** As of 2026-10-13:
> - **Signup** (`src/App.jsx`, `supabase.auth.signUp` → `profiles` insert) sends only `id`, `username`, `phone`. It no longer sends `role`. `role` and `balance` must therefore come from the **column defaults** (`'user'`, `0` — §1.1) and be enforced by the `protect_profiles_columns()` trigger (§2.1, §3.3): without it, a malicious client can still POST `role = 'admin'` straight to the Supabase REST API with the public anon key, because this insert runs in the browser.
> - **Profile edits** (`ff_id`, `nickname`, `avatar_url`) are still direct anon-key updates from the browser. RLS cannot restrict columns, so the BEFORE UPDATE trigger must reject changes to `role`, `balance`, `wins`, `level`, `username` for non-service-role sessions.
> - Until RLS + triggers are applied, **do not treat the app as safe against a crafted client** (docs/AUDIT.md P0-4). Nothing in this phase changes that; it only removes the client's ability to *hand over* a privileged value.

### 2.1 `profiles`
- **SELECT**: `user_id = auth.uid()` — [required by code] (own profile fetch `App.jsx:352`). Admin read-all — [recommended] only if a feature needs it (none today; the admin "registered players" view reads `profiles(username)` **through** `match_registrations`, see §2.3).
- **INSERT**: `id = auth.uid()` — [required by code] (signup insert `App.jsx:152–161`). Plus a trigger forcing `role = 'user'` on any insert/update performed by a non-service-role session — **[required], closes audit P0-4** (the client no longer sends `role`, so this trigger + the column default are what make the value trustworthy).
- **UPDATE**: `id = auth.uid()` restricted to columns `ff_id, nickname, avatar_url` — [required by code] (`App.jsx:763–770`); since RLS cannot restrict columns, enforce with a BEFORE UPDATE trigger that rejects changes to `role, balance, wins, level, username` unless `auth.role() = 'service_role'` — [recommended, closes P0-4]. Alternative: move profile editing into an authenticated API route.
- **DELETE**: none for clients — [recommended].

### 2.2 `tournaments`
- **SELECT**: all authenticated users — [required by code] (home list `App.jsx:363`, detail, MyMatches `:1403–1417`). **But** `room_id`/`room_password` must not be world-readable: the code's `select('*')` makes this a P0-3 leak today. Recommended shape:
  - **[recommended]** new table `tournament_room_credentials (tournament_id uuid PK/FK, room_id text, room_password text)` + `security definer` function `get_room_details(p_tournament_id)` returning the row **only** when a `match_registrations` row exists for `auth.uid()`; keep the columns on `tournaments` readable only to admins (column-level privileges or view) until the client stops using `select('*')`.
  - Minimal (matches current behavior, closes nothing): plain select-all. Not recommended.
- **INSERT / UPDATE / DELETE**: admin only (role from profile or JWT claim) — [required by code for safety]. Since 2026-10-13 the browser no longer writes tournaments at all: `AdminView.jsx` → `src/lib/apiClient.js` → `api/admin.js` (`createTournament`, `updateTournament`), which re-checks the caller's role from `profiles` with the service-role client and validates every field server-side; `api/deleteTournament.js` does the same for deletes. RLS policies for these paths are therefore **defence in depth**, not the only gate (the service role bypasses RLS). Status values constrained to `('registration','upcoming','live','completed')` — [recommended, matches `api/_lib/validate.js` `TOURNAMENT_STATUSES` and `App.jsx:1166`]; note `'cancelled'` is not a valid value yet (the admin router refuses it with an honest 400 until the refund flow exists).

### 2.3 `match_registrations`
- **SELECT**: own rows (`user_id = auth.uid()`) — [required by code] (MyMatches `App.jsx:1418`, duplicate check `:571, 583`); **admin read-all** — [required by code] but now performed **server-side**: `api/admin.js` `listRegistrations` (service role, role-checked, `limit 500`) including the embedded `profiles(username)` join. The browser no longer queries `match_registrations` for other users (`AdminView.jsx` calls the API), so the matching RLS policy is [recommended] defence in depth rather than the only barrier.
- **INSERT**: own rows, `user_id = auth.uid()` — [required by code] (signup of a registration happens only via the API's service role today, but the unique-violation path implies direct inserts must not be client-writable: actually the API insert uses the service-role client and bypasses RLS, so the client-facing policy is **[recommended]**: deny client inserts entirely once the atomic RPC exists — see §3.1).
- **UPDATE**: none for clients — [recommended].
- **DELETE**: none for clients (admin cleanup should go through the API/RPC) — [recommended].

### 2.4 `transactions`
- **SELECT**: `user_id = auth.uid()` — [required by code] (wallet `App.jsx:684`; today's code omits the filter, which is audit P0-5 — the DB policy is the authoritative fix).
- **INSERT / UPDATE / DELETE**: none for clients; only the server's service role writes (join route, `approve_wallet_request()` §3.4, `cancel_tournament_with_refund()` §3.6) — [required by code for safety] (service role bypasses RLS, so plain absence of policies achieves this).

### 2.5 `wallet_requests`
- **INSERT**: own row only, `user_id = auth.uid()`, and only born `status = 'pending'` with no decision columns — [required by code for safety] (`api/wallet.js` writes through the service role; this policy protects against a forged browser write).
- **SELECT**: `user_id = auth.uid()` — [required by code].
- **UPDATE / DELETE**: **no policies at all** — [required by code for safety]. A user can never change an amount, a status or a decision; the only writers are `approve_wallet_request()` / `reject_wallet_request()` (§3.4, EXECUTE to `service_role` only).

### 2.6 `admin_audit_log`
- **No policies.** RLS is enabled and nothing is granted to `anon`/`authenticated`, so a browser session can neither read nor write it — [required by code for safety]. The service role bypasses RLS and does the writing.

---

## 3. Functions

### 3.1 `join_tournament(p_user_id uuid, p_tournament_id uuid, p_ff_uid text, p_ign text) returns json` — **[recommended, closes audit P0-1 + P0-6]**

**Called by:** `api/joinTournament.js` only, on the `JOIN_USE_RPC=true` path, through the **service-role** client.
**Executed as:** `security definer`, and **EXECUTE granted to `service_role` only** (`revoke all … from public, anon, authenticated`).

**Why the signature takes `p_user_id` (and does NOT use `auth.uid()`)** — this was an integration bug fixed 2026-10-13: the API route holds `SUPABASE_SERVICE_ROLE_KEY` and sends no user JWT, so inside a service-role RPC `auth.uid()` is **NULL** — an `auth.uid()`-based function could never join anyone. At the same time a grant to `authenticated` implied the browser could call the function directly, which is not the design. Therefore:

- caller identity = **`p_user_id`**, supplied by the API route as `user.id` from `requireUser()` (i.e. the subject of the verified `Authorization: Bearer` token, `supabase.auth.getUser(token)`). It is never read from — and never overridable by — the request body (`api/joinTournament.js`, tests in `tests/api.test.js`).
- the function is unreachable from the browser: no `anon`/`authenticated` EXECUTE grant.
- the earlier draft signature `join_tournament(uuid, text, text)` is explicitly `drop function if exists`-ed in `003_functions_triggers.sql` so a stale, wrongly-granted overload cannot linger in a database where that draft was applied.

Single transaction:
1. Reject a NULL `p_user_id` (`{ error: 'Not authenticated' }`) — the API route already 401s before reaching here; this is defence in depth.
2. Lock tournament row (`FOR UPDATE`); derive fee from `tournaments.entry_fee` (server-side, never the client) and reject `status = 'cancelled'` (void) and `status = 'completed'` (over); reject `current_players >= max_players` — removes the TOCTOU capacity race.
3. Lock profile row (`FOR UPDATE`); check `balance >= entry_fee`; update balance.
4. Insert `match_registrations` (unique constraint still the duplicate backstop; map `23505` to "Already joined" for backward compatibility with the client's handling at `App.jsx:596`), refunding inside the same transaction on conflict.
5. `current_players := current_players + 1` (same locked transaction, no recount window).
6. Insert the `transactions` ledger row and **check it** (`insert` + `if not found then raise`). A ledger failure raises and rolls the whole function back, so money can never move without a ledger row. It is deliberately not swallowed by an exception handler.
7. Return the same success/error JSON shape the API uses today (`{ success: true }` / `{ error }`, plus `code: '23505'` for duplicates) to keep response shapes backward compatible (permanent rule 5). `api/joinTournament.js` maps the message strings to HTTP statuses.

### 3.2 `get_room_details(p_tournament_id uuid) returns record` — **[recommended, closes P0-3]**

**Called by:** the **browser** — `src/App.jsx` (`TournamentDetailView`), gated by `VITE_FEATURE_ROOM_RPC` — using the signed-in user's Supabase session through the anon client.
**Executed as:** `security definer`, **EXECUTE granted to `authenticated`** (revoked from `public`/`anon`).

**`auth.uid()` stays here on purpose, and this is the documented contract:** unlike `join_tournament` (§3.1), this function is invoked with the *user's JWT*, so `auth.uid()` is populated and is the correct caller identity. The client passes only `p_tournament_id` — never a user id — and the function returns `room_id, room_password` only if a `match_registrations` row exists for `auth.uid()` + that tournament; otherwise it returns no row. Do not "fix" this into a `p_user_id` parameter: that would let any caller request another player's room credentials. Conversely, do not grant `join_tournament` the way this one is granted.

### 3.3 `protect_profiles_sensitive_columns()` trigger — **[recommended, closes P0-4]**
BEFORE INSERT/UPDATE on `profiles`; when `auth.role() <> 'service_role'`, force `new.role = 'user'` on insert and raise on attempts to change `role, balance, wins, level` on update.

### 3.4 `approve_wallet_request(p_request_id uuid, p_admin_id uuid, p_admin_note text)` / `reject_wallet_request(...)` — **[required by code for the wallet-request flags, closes the "fake success" risk]**
Implemented in `supabase/proposed/005_wallet_requests.sql` §4.

**Called by:** `api/admin.js` (`approveWalletRequest` / `rejectWalletRequest`) through the **service-role** client, with `p_admin_id` = the admin id verified from the caller's token.
**Executed as:** `security definer`, **EXECUTE granted to `service_role` only** — `auth.uid()` is not available under the service role, so the admin identity is an explicit parameter (same pattern as `join_tournament` §3.1).

Behaviour:
1. Lock the request row (`FOR UPDATE`) — two admins clicking approve cannot double-credit.
2. Idempotent verdicts: `Request already approved` / `Request already rejected`; a reject of an approved request is refused (`Request already approved and cannot be rejected`) because money already moved.
3. `deposit` → `balance = balance + amount` and a `transactions` row `('deposit', +amount)`.
4. `withdraw` → re-read the balance **under lock**; if it is below the amount, return `Insufficient balance at approval time` and write nothing; otherwise `balance = balance - amount` and a `transactions` row `('withdraw', -amount)`.
5. Set `status`, `admin_note`, `reviewed_by = p_admin_id`, `reviewed_at = now()`.
6. Return `{"success": true, "amount": …, "type": …}` or `{"error": "…"}` — `api/admin.js` maps the verdict to an HTTP status and never invents a success.

If the function is missing, the router answers **503 "requires database setup: the approve_wallet_request() function is not installed. No changes were made."** — the honest alternative to a fake approval.

### 3.5 Rate limiting the wallet-request route (serverless constraints) — **[required for the wallet-request flags]**
`api/wallet.js` enforces a per-user limit of **5 requests per rolling hour** (`WALLET_REQUESTS_PER_HOUR`, default 5) with a **database count** (`.select('id', { count: 'exact', head: true }).eq('user_id', …).gte('created_at', now − 1h)`).

Why the database and not memory: each serverless invocation may run on a different instance, instances are recycled between requests, and there is no shared in-process state — a module-level counter would neither be shared across instances nor survive a cold start, and would silently under-count under concurrency. The DB count is shared by every instance and is covered by `wallet_requests_user_created_idx`. It is a **coarse abuse brake, not a billing-grade limiter** (the window is fixed at "one hour back from now", and the DB round-trip happens before the insert, so two simultaneous requests can both pass). The DB-phase upgrade is a sliding-window table (or an external store such as Upstash) plus the same check inside the insert path.

### 3.6 `cancel_tournament_with_refund(p_tournament_id uuid, p_admin_id uuid, p_reason text)` — **[required by code for `ENABLE_TOURNAMENT_CANCELLATION`]**
Implemented in `supabase/proposed/006_cancel_tournament_refunds.sql` §3.

**Called by:** `api/admin.js` (`cancelTournament`) through the **service-role** client, and **only** when the tournament has paid registrations AND `ENABLE_TOURNAMENT_CANCELLATION=true`.
**Executed as:** `security definer`, **EXECUTE granted to `service_role` only**.

1. Lock the tournament row (`FOR UPDATE`); `not found` → `Tournament not found`; already `'cancelled'` → `{"success": true, "refunded": 0, "already_cancelled": true}` (idempotent — no second refund); `'completed'` → refused.
2. If `entry_fee > 0`, refund **every** registration by `entry_fee` and insert one `('refund', +entry_fee)` ledger row per refund — all inside the one transaction. A registration whose profile row is missing raises and rolls the whole thing back (no partial refunds).
3. Set `status = 'cancelled'`, write an `admin_audit_log` row when 007 is applied (skipped silently otherwise).
4. `tournaments.status` must accept `'cancelled'` — §2 of 006 replaces the check constraint declared in 001.

Refunds are **never** looped from the client or from the route: the route only ever calls this function, and when the function is missing it answers 503 and changes nothing.

### 3.7 `sync_current_players()` trigger — **[recommended, defense-in-depth]**
AFTER INSERT/DELETE on `match_registrations`: increment/decrement `tournaments.current_players`. If §3.1 is adopted, this trigger is redundant for the RPC path but protects any other write path (e.g. admin manual inserts).

### 3.8 `set_updated_at()` trigger — **[recommended]** (standard `updated_at` maintenance) — optional.

---

## 4. Indexes

| Index | Label | Reason (evidence) |
|---|---|---|
| `match_registrations (tournament_id, user_id) UNIQUE` | **[required by code]** | duplicate-join detection depends on the `23505` error (`api/joinTournament.js:93`); also serves both lookup directions |
| `match_registrations (user_id)` | **[required by code]** | MyMatches filter `App.jsx:1418` |
| `match_registrations (tournament_id)` (non-unique, for count) | [recommended] | the head-count query `api/joinTournament.js:100–103`; the unique composite index already covers this — extra index only if the composite is dropped |
| `transactions (user_id, created_at desc)` | **[required by code]** | wallet query once user-filtered (`App.jsx:684` + P0-5 fix) |
| `tournaments (created_at desc)` | **[required by code]** | home list ordering `App.jsx:363` |
| `tournaments (status)` | [recommended] | admin dashboard counts `App.jsx:1160–1164`; low-cardinality, only worth it at scale |
| `profiles (username) UNIQUE` | **[required by code]** | the signup flow reports "Username already taken" from a duplicate error (`App.jsx:163–164`); without this constraint usernames are never unique |
| `profiles (role)` | [recommended] | cheap; only useful at scale for admin lookups |
| `wallet_requests (user_id, created_at desc)` | **[required by code for the wallet flags]** | the user's own list (`api/wallet.js`) and the rolling-hour rate-limit count (`.eq(user_id).gte(created_at)`) |
| `wallet_requests (status, created_at desc)` | **[required by code for the wallet flags]** | the admin pending queue (`api/admin.js` `listWalletRequests`, `.eq('status','pending').order('created_at')`) |
| `admin_audit_log (created_at desc)` + `(target_type, target_id)` | [recommended] | admin action history; cheap, but the only reads today are manual |

---

## 5. Environment / platform requirements (server)

| Item | Label | Reason |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set as Vercel **server** env vars | **[required by code]** | `api/joinTournament.js:3–6`, `api/deleteTournament.js:3–6` (never prefixed `VITE_`) |
| Service-role key **never** in `VITE_*` vars or client bundle | **[required by code]** | permanent rule 1; `VITE_` vars are inlined into the public JS bundle |
| Guarded module init: honest 503 with `{ error: 'Service temporarily unavailable' }` when env vars are missing | [recommended] | permanent rule 7; today a missing env var throws at import time (audit P1-1) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in client env | **[required by code]** | `src/lib/supabaseClient.js:6–7` |
| `ENABLE_WALLET_REQUESTS=true` | **[required by code for the wallet-request flags]** | server kill switch for the whole wallet-request flow (`api/wallet.js`, the wallet actions in `api/admin.js`). While off every wallet-request action answers 503 and no money can move. Safe default `false`. |
| `WALLET_REQUESTS_PER_HOUR` | [recommended] | overrides the per-user hourly cap (default 5, §3.5). |
| `ENABLE_TOURNAMENT_CANCELLATION=true` | **[required by code for refunding cancellations]** | gates `cancel_tournament_with_refund()` (§3.6). Irrelevant when the tournament has no paid registrations. Safe default `false`. |
| `VITE_FEATURE_WALLET_REQUESTS=true` (client) | **[required by code for the wallet-request flags]** | shows the request form + list. Both flags are required — see the README flag table. |
| `VITE_SUPPORT_WHATSAPP`, `VITE_SUPPORT_UPI` (client) | [recommended] | public support contact shown in the request form. **VITE_ values are bundled into the browser: treat them as public.** The UPI ID is **display only** — it is never used to verify a payment (§3.4), and unset values render as an honest "not configured yet" line rather than a made-up number. |
| Serverless reality check for the wallet queue | **[required by code]** | rate limiting and idempotency live in the database, never in process memory (§3.5): instances are recycled and requests may run in parallel. The same reasoning is why approvals are one atomic function instead of a read-modify-write in the route. |

---

## 6. Backward-compatibility contract (permanent rule 5)

Any DB-phase change must preserve:
- `POST /api/joinTournament` responses: `{ success: true }` on 200; `{ error }` on failures; `{ error: 'Already joined', code: '23505' }` on duplicates (client branch `App.jsx:596`). The RPC path's function must keep returning exactly those JSON shapes (§3.1) and must keep accepting `p_user_id` — the API route has no JWT to offer it.
- `POST /api/deleteTournament` responses: `{ success: true }` / `{ error }`.
- `POST /api/admin` responses: `{ success: true, tournament, auditLogged }` (create/update), `{ success: true, registrations: [...] }` (listRegistrations), `{ success: true, tournament, refunded, auditLogged }` (cancelTournament), `{ success: true, requests: [...] }` (listWalletRequests), `{ success: true, walletRequest, auditLogged }` (approve/reject), `{ error }` on failures — consumed by `src/lib/apiClient.js` + `AdminView.jsx`. Existing keys keep their meaning; `auditLogged` was added and clients must tolerate it being absent. The `{ action }` envelope is part of the contract; the route must stay a **single** file to respect Vercel Hobby's 12-function limit (3 routes total: `joinTournament`, `deleteTournament`, `admin` + `wallet` = 4).
- `POST /api/wallet` responses: `{ success: true, request }` (createWalletRequest), `{ success: true, requests: [...] }` (listWalletRequests), `{ error }` on failures. `503` carries the honest "not enabled" or "requires database setup" message; `429` carries the rate-limit message.
- `tournaments.status` gains the value `'cancelled'` (001 + 006 §2). Clients must treat it as a terminal state — `src/lib/tournamentStatus.js` already maps it, and the admin edit form refuses transitions out of it.
- Table/column names and types as listed in §1 (the client uses `select('*')` in several places, so renaming/removing columns breaks the UI).
- `tournaments.status` values `registration|upcoming|live|completed` and `profiles.role` value `admin` — the UI branches on these literal strings (`App.jsx:395, 536, 1166, 1492`).

## 7. Proposed (not applied) migrations

- `supabase/proposed/001_tables_constraints.sql` — tables (if missing), columns, constraints, unique indexes.
- `supabase/proposed/002_rls_policies.sql` — enable RLS + policies per §2.
- `supabase/proposed/003_functions_triggers.sql` — `join_tournament`, `get_room_details`, profile-protection trigger, count trigger.
- `supabase/proposed/004_room_credentials_split.sql` — room-credential table + column lockdown (optional companion to `get_room_details`).
- `supabase/proposed/005_wallet_requests.sql` — `wallet_requests` (table, constraints, RLS: users insert/select their own rows only, **no update policy**), `approve_wallet_request()` / `reject_wallet_request()` granted to `service_role` only, plus verification queries and rollback notes.
- `supabase/proposed/006_cancel_tournament_refunds.sql` — the ledger sign convention, the `tournaments_status_check` replacement that allows `'cancelled'`, and `cancel_tournament_with_refund()` (atomic, idempotent, `service_role` only).
- `supabase/proposed/007_admin_audit_log.sql` — `admin_audit_log` (append-only, RLS enabled with **zero** policies) for the admin actions the router records best-effort.

Each file is idempotent (precondition-checked) and header-stamped: **"NOT APPLIED. For the database phase."** Nothing has been run.
