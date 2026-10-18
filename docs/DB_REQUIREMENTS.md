# ClashArena — Database Requirements

> ## Contract correction — 2026-10-16
> The project owner supplied the deployed database facts below. They override the
> UUID-era assumptions in application code and in the proposed SQL drafts:
>
> - `tournaments.id` and `match_registrations.id` are **`bigint`**; every
>   tournament foreign key, RPC parameter, room-credential key, and audit target
>   that refers to a tournament must therefore be bigint-compatible.
> - `tournaments.prize` is **`numeric(12,2)`**.
> - The deployed standings writer is
>   **`admin_set_tournament_results(p_tournament_id bigint, p_admin_id uuid, p_results jsonb) -> jsonb`**
>   with a `{ success, error }` verdict.
>
> Do **not** run or edit SQL from this document. The UUID-era drafts are not a
> migration plan until they have been rewritten and reviewed against this
> contract. In particular, proposed **003, 005, and 006 must be rewritten for
> bigint before application**. See §7 for the full draft-by-draft status.
>
> **Application compatibility gap — closed 2026-10-17:** `validateTournamentId`
> in `api/_lib/validate.js` now accepts the deployed bigint tournament IDs (a
> positive integer, as number or digits-only string, returned as a Number) and
> rejects UUID-shaped values with 400. The audit `target_id` is stringified for
> its TEXT column. No SQL or feature-flag values were changed.

> ## Docs sync — 2026-10-17 (R0, after the DB phase was applied by Claude)
> The live database now differs from the [recommended] drafts below in important
> ways; `docs/PROJECT_STATE.md` is the authoritative record. In particular:
>
> - **Room credentials are locked down:** the browser can read `tournaments`
>   EXCEPT `room_id`/`room_password` (column-level SELECT grant). A browser
>   `select('*')` on tournaments now **FAILS** (permission denied) — every
>   tournaments query must list its columns. Players get room credentials only
>   through the deployed `get_room_details(p_tournament_id bigint)`; admins
>   read/edit them through `api/admin.js` with the service role.
> - **Atomic join is DEPLOYED and ENABLED in production**
>   (`JOIN_USE_RPC=true`): `join_tournament(p_user_id uuid, p_tournament_id
>   bigint, p_ff_uid text, p_ign text) -> json`, service_role only.
> - **Payments exist:** `payments` and `payment_webhook_events` tables and the
>   atomic, idempotent `credit_payment(...)` RPC (service_role only) are
>   deployed — the ONLY way a payment becomes wallet balance. Razorpay R1
>   server code is merged; the client (R2) is still pending.
> - **Not created (do not call):** `wallet_requests` table, wallet
>   approve/reject RPCs, `cancel_tournament_with_refund` — their drafts are
>   uuid-era and must be REWRITTEN for bigint first; the matching flags stay
>   OFF/unset.
> - **Browser privileges (deployed):** read own profile / registrations /
>   transactions; UPDATE only `profiles.ff_id`, `nickname`, `avatar_url`;
>   no inserts/deletes on profiles; no browser writes to tournaments,
>   match_registrations, transactions. Profile creation at signup happens in
>   the `handle_new_user` trigger; `block_balance_update` protects
>   balance/role/level/wins/total_played.
> - **Migrations `clasharena_phase_a_00 .. _10` were applied by Claude** through
>   the Supabase connector. The `supabase/proposed/` drafts (003, 005, 006
>   explicitly; others by review) are OUTDATED (uuid-era) and must not be
>   applied.

**Source of truth:** the owner-supplied deployed contract above plus application
code in this repo. Where they disagree, the deployed contract wins. The live
Supabase project was not inspected in this workspace; this document records what
is known and what the code needs to be made compatible with it.

**Labels:**
- **[required by code]** — the app queries/writes this today; without it the feature is broken.
- **[recommended]** — not required for the current code to run, but required to close a P0/P1 audit finding or for production safety.

Proposed, **not applied** SQL lives in `supabase/proposed/` (each file header states this).

---

## 1. Tables and columns

### 1.1 `profiles`

| Column | Type / contract | Label | Used by (evidence) |
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

| Column | Type / contract | Label | Used by (evidence) |
|---|---|---|---|
| `id` | **`bigint` PK (deployed)** | [required by code] | referenced everywhere; validated as bigint by `api/_lib/validate.js` `validateTournamentId` (gap closed 2026-10-17) |
| `name` | `text not null` | [required by code] | admin form `AdminView.jsx`; written server-side by `api/admin.js` `createTournament`/`updateTournament` (3–80 chars, validated there) |
| `mode` | `text not null default 'Solo'` | [required by code] | admin form `AdminView.jsx` (Solo/Duo/Squad/1v1) → server allow-list `api/_lib/validate.js` `TOURNAMENT_MODES`; display `App.jsx:546, 634` |
| `prize` | **`numeric(12,2)` (deployed)**, not null default `0` | [required by code] | admin form → `api/admin.js` (>= 0); display `App.jsx:540, 622` |
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

| Column | Type / contract | Label | Used by (evidence) |
|---|---|---|---|
| `id` | **`bigint` PK (deployed)** | [required by code] | `App.jsx:571, 583` (`.select('id')`) |
| `tournament_id` | **`bigint not null`** FK → `tournaments.id` | [required by code] | `api/joinTournament.js:24–28, 84`, `api/deleteTournament.js:33`, `App.jsx:571, 1405–1416` |
| `user_id` | `uuid not null` FK → `auth.users.id` | [required by code] | `api/joinTournament.js:26, 86`, `App.jsx:572, 1418` |
| `ff_uid` | `text not null` | [required by code] | `api/joinTournament.js:15–18, 87`, admin list `App.jsx:1299` |
| `ign` | `text not null` | [required by code] | `api/joinTournament.js:16–18, 88`, admin list `App.jsx:1296` |
| `status` | `text not null default 'joined'` | [required by code] | write `'joined'` `api/joinTournament.js:89` (no read in UI today) |
| `created_at` | `timestamptz not null default now()` | [required by code] | ordering `App.jsx:1059` |

Constraints required:
- **UNIQUE (`tournament_id`, `user_id`)** — [required by code]: the API relies on catching Postgres `23505` for the duplicate-join path (`api/joinTournament.js:93–95`; client handles it at `App.jsx:596`). Without this constraint, duplicate joins and double charges are possible.
- FK to `tournaments` with `ON DELETE CASCADE` — [recommended]: `deleteTournament.js:32–44` deletes registrations first, then the tournament, in two non-transactional steps; a cascade (or better, a single delete RPC) removes the orphan window.
- FK to `auth.users` with `ON DELETE CASCADE` — [recommended] (profile deletion hygiene).

**Bigint compatibility note:** tournament IDs are validated as bigint end-to-end
since 2026-10-17: `validateTournamentId` accepts positive integers (number or
digits-only string) and returns a Number; `openTournament` in `App.jsx` accepts a
numeric id; the audit-log `target_id` is stringified for its TEXT column. `user_id`
remains UUID because it references Supabase Auth; only tournament / registration
identities are bigint.

### 1.3.1 `tournament_results` — deployed standings data

This table is deployed for the results feature; it is not supplied by a proposed
migration in this repository. At minimum its tournament relationship must be
`bigint`-compatible:

| Column / contract | Type / rule | Why it matters |
|---|---|---|
| `tournament_id` | **`bigint`** FK → `tournaments.id` | Player and admin result reads filter by this value. |
| `user_id` | `uuid` FK → `profiles.id` / Auth identity | Results are validated against registrations; a player identity remains UUID. |
| player-safe fields | `placement`, `player_name`, `kills`, `prize_amount` | The player view reads only these fields. `prize_amount` is a recorded standing, **not** a wallet payout. |
| admin-only field | `note` (if present) | Never expose administrative notes or phone numbers in player-facing results. |

The deployed write contract is exact and must not be replaced with a UUID draft:

```text
admin_set_tournament_results(
  p_tournament_id bigint,
  p_admin_id uuid,
  p_results jsonb
) -> jsonb  -- { success, error }
```

It is called only by `api/admin.js` through the service-role client after the
server verifies the caller is an admin and that every submitted player belongs to
the tournament. It atomically replaces recorded standings and marks the
competition completed. It **does not** credit wallet balances; prizes stay manual
payout records.

### 1.4 `transactions`

| Column | Type / contract | Label | Used by (evidence) |
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

| Column | Type / contract | Label | Used by (evidence) |
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

| Column | Type / contract | Label | Used by (evidence) |
|---|---|---|---|
| `id` | `uuid` PK | [required by code] | — |
| `admin_id` | `uuid` FK → `profiles.id` on delete set null | [required by code] | `api/_lib/audit.js` (the verified admin from the token) |
| `action` | `text not null` | [required by code] | `createTournament` / `updateTournament` / `cancelTournament` / `approveWalletRequest` / `rejectWalletRequest` |
| `target_type` | `text not null` | [required by code] | `'tournament'` or `'wallet_request'` |
| `target_id` | `text` (or separate typed target columns) | [required by code] | must represent a bigint tournament target **or** a UUID wallet-request target; a UUID-only column is incompatible with deployed tournament IDs |
| `details` | `jsonb not null default '{}'` | [required by code] | e.g. `{"refunded": 4, "reason": "..."}` |
| `created_at` | `timestamptz not null default now()` | [required by code] | ordering |

The app writes it **best effort**: a missing table never fails an action, but the response carries `auditLogged: false` and the server logs a warning, so the gap is visible instead of implied.

### 1.7 `payments` and `payment_webhook_events` — deployed payments storage (2026-10-17)

`payments` (one row per Razorpay order; the owner may SELECT own rows; ALL
writes are service-role only):

| Column | Type / contract |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `uuid` — the VERIFIED user, never a client value |
| `provider` | `'razorpay'` |
| `provider_order_id` | `text UNIQUE` |
| `provider_payment_id` | `text UNIQUE`, null until paid |
| `amount_paise` | `bigint` — whole-rupee amounts only (100..10,000,000 paise), set from Razorpay's own response |
| `currency` | `'INR'` |
| `status` | `created` \| `failed` \| `credited` |
| `failure_reason` | `text`, short, written from `payment.failed` only while `status='created'` |
| `transaction_id` | `uuid` — the deposit ledger row once credited |
| `credited_at`, `created_at`, `updated_at` | timestamps |

`payment_webhook_events`: server-only event-id idempotency log; no client
access. `transactions.reference` holds the Razorpay payment id of a deposit
row. The contract for these is `docs/PROJECT_STATE.md` (authoritative).

---

## 2. Row Level Security

> The Supabase anon key is shipped to every browser (`src/lib/supabaseClient.js:6–7`), so **RLS is the only thing standing between any visitor and full read/write on these tables.** The service-role key used by `api/*` bypasses RLS entirely — every policy below is written for the `anon`/`authenticated` roles.

> ### ✅ RESOLVED 2026-10-17 — the DB phase below was applied by Claude
> The [recommended] protections described here are now DEPLOYED: signup is
> handled by the `handle_new_user` trigger (the browser no longer inserts
> profiles), `block_balance_update` rejects balance/role/level/wins/
> total_played changes from non-service roles, and profile updates are
> restricted to `ff_id`, `nickname`, `avatar_url`. The historical warning is
> kept for context.

### 2.1 `profiles`
- **SELECT**: `user_id = auth.uid()` — [required by code] (own profile fetch `App.jsx:352`). Admin read-all — [recommended] only if a feature needs it (none today; the admin "registered players" view reads `profiles(username)` **through** `match_registrations`, see §2.3).
- **INSERT**: `id = auth.uid()` — [required by code] (signup insert `App.jsx:152–161`). Plus a trigger forcing `role = 'user'` on any insert/update performed by a non-service-role session — **[required], closes audit P0-4** (the client no longer sends `role`, so this trigger + the column default are what make the value trustworthy).
- **UPDATE**: `id = auth.uid()` restricted to columns `ff_id, nickname, avatar_url` — [required by code] (`App.jsx:763–770`); since RLS cannot restrict columns, enforce with a BEFORE UPDATE trigger that rejects changes to `role, balance, wins, level, username` unless `auth.role() = 'service_role'` — [recommended, closes P0-4]. Alternative: move profile editing into an authenticated API route.
- **DELETE**: none for clients — [recommended].

### 2.2 `tournaments`
- **SELECT (DEPLOYED, 2026-10-17):** authenticated users may read tournaments
  **EXCEPT `room_id` and `room_password`** — enforced by a column-level SELECT
  grant, not a policy. Consequences for code: a browser `select('*')` on
  tournaments **fails** (permission denied); every client-side tournaments
  query must list its columns explicitly, and any NEW column needs an explicit
  `GRANT SELECT (col) ... TO anon, authenticated`. Room credentials reach
  players only through `get_room_details(p_tournament_id bigint)` (§3.2,
  deployed) and admins through `api/admin.js` (service role). The historical
  P0-3 leak (world-readable room columns) is closed at the database level.
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

### 3.1 `join_tournament(p_user_id uuid, p_tournament_id bigint, p_ff_uid text, p_ign text) returns json` — **[DEPLOYED, enabled in production: `JOIN_USE_RPC=true`]**

**Called by:** `api/joinTournament.js` only, on the `JOIN_USE_RPC=true` path, through the **service-role** client.
**Executed as:** `security definer`, and **EXECUTE granted to `service_role` only** (`revoke all … from public, anon, authenticated`).

**Why the signature takes `p_user_id` (and does NOT use `auth.uid()`)** — this was an integration bug fixed 2026-10-13: the API route holds `SUPABASE_SERVICE_ROLE_KEY` and sends no user JWT, so inside a service-role RPC `auth.uid()` is **NULL** — an `auth.uid()`-based function could never join anyone. At the same time a grant to `authenticated` implied the browser could call the function directly, which is not the design. Therefore:

- caller identity = **`p_user_id`**, supplied by the API route as `user.id` from `requireUser()` (i.e. the subject of the verified `Authorization: Bearer` token, `supabase.auth.getUser(token)`). It is never read from — and never overridable by — the request body (`api/joinTournament.js`, tests in `tests/api.test.js`).
- the function is unreachable from the browser: no `anon`/`authenticated` EXECUTE grant.
- `supabase/proposed/003_functions_triggers.sql` currently declares UUID tournament parameters and cannot be applied unchanged. Its replacement must use `p_tournament_id bigint` in the function, grants/revokes, room RPC, and all verification/rollback signatures; do not run the UUID-era draft.

Single transaction:
1. Reject a NULL `p_user_id` (`{ error: 'Not authenticated' }`) — the API route already 401s before reaching here; this is defence in depth.
2. Lock tournament row (`FOR UPDATE`); derive fee from `tournaments.entry_fee` (server-side, never the client) and reject `status = 'cancelled'` (void) and `status = 'completed'` (over); reject `current_players >= max_players` — removes the TOCTOU capacity race.
3. Lock profile row (`FOR UPDATE`); check `balance >= entry_fee`; update balance.
4. Insert `match_registrations` (unique constraint still the duplicate backstop; map `23505` to "Already joined" for backward compatibility with the client's handling at `App.jsx:596`), refunding inside the same transaction on conflict.
5. `current_players := current_players + 1` (same locked transaction, no recount window).
6. Insert the `transactions` ledger row and **check it** (`insert` + `if not found then raise`). A ledger failure raises and rolls the whole function back, so money can never move without a ledger row. It is deliberately not swallowed by an exception handler.
7. Return the same success/error JSON shape the API uses today (`{ success: true }` / `{ error }`, plus `code: '23505'` for duplicates) to keep response shapes backward compatible (permanent rule 5). `api/joinTournament.js` maps the message strings to HTTP statuses.

### 3.2 `get_room_details(p_tournament_id bigint) returns record` — **[DEPLOYED, closes P0-3]**

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

### 3.6 `cancel_tournament_with_refund(p_tournament_id bigint, p_admin_id uuid, p_reason text)` — **[required by code for `ENABLE_TOURNAMENT_CANCELLATION`]**
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

### 3.9 `admin_set_tournament_results(p_tournament_id bigint, p_admin_id uuid, p_results jsonb) -> jsonb` — **[deployed]**

This is the deployed results writer used by `api/admin.js`; it is **not** a
proposed UUID-era function. It returns a JSONB verdict with `success` and/or a
safe `error` string. The service-role route supplies the verified admin UUID,
never a client-selected admin. The function must validate bigint tournament
identity and registered players server-side, replace the standings as one
operation, and mark the tournament completed without making wallet payouts.

### 3.10 `credit_payment(p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint, p_currency text, p_event_id text default null) -> json` — **[DEPLOYED]**

The ONLY way a payment becomes wallet balance (used by `api/payments.js`
verify and `api/razorpayWebhook.js`). service_role only. Atomic + idempotent:
locks the `payments` row by order id; `{ success: true, duplicate: true }` if
already credited; rejects with `'Unknown order' / 'Currency mismatch' /
'Amount mismatch' / 'Payment already used' / 'Missing data'` (nothing
credited); otherwise adds a deposit ledger row (`transactions.reference` =
Razorpay payment id), increases `profiles.balance`, marks the payment
`credited`. Callers must use these EXACT parameter names via
`supabase.rpc('credit_payment', {...})`. `p_event_id` = the webhook's
`x-razorpay-event-id` header or `'verify:<payment_id>'`.

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
- `admin_set_tournament_results` RPC: exact deployed signature `p_tournament_id bigint, p_admin_id uuid, p_results jsonb`; JSONB verdict `{ success, error }`. Do not substitute a UUID tournament ID or infer a wallet payout from a recorded prize.
- `tournaments.status` gains the value `'cancelled'` (001 + 006 §2). Clients must treat it as a terminal state — `src/lib/tournamentStatus.js` already maps it, and the admin edit form refuses transitions out of it.
- `tournaments` columns: the browser reads tournaments with **explicit column lists** now (`select('*')` fails against the deployed column-level grant, see §2.2) — adding a column needs an explicit grant; removing/renaming one breaks the listed queries.
- `tournaments.status` values `registration|upcoming|live|completed` and `profiles.role` value `admin` — the UI branches on these literal strings (`App.jsx:395, 536, 1166, 1492`).

## 7. Proposed (not applied) migrations

### Bigint rewrite gate — do not apply the UUID-era drafts

None of the files below has been run from this workspace. They are historical
proposals, not approved execution instructions. The deployed bigint contract
means they must be rewritten and reviewed before any application:

- `supabase/proposed/001_tables_constraints.sql` — **do not apply unchanged**:
  its tournament / registration schema is UUID-era and conflicts directly with
  deployed bigint IDs.
- `supabase/proposed/002_rls_policies.sql` — review after the corrected table
  identities and foreign keys are settled; it must not reintroduce a UUID
  tournament assumption.
- `supabase/proposed/003_functions_triggers.sql` — **must be rewritten for
  bigint before application**. `join_tournament`, `get_room_details`, all
  function identity/grant statements, and verification / rollback references
  need bigint tournament parameters.
- `supabase/proposed/004_room_credentials_split.sql` — also needs a bigint
  `tournament_id` FK before application.
- `supabase/proposed/005_wallet_requests.sql` — **must be rewritten and
  re-reviewed for the bigint schema before application**, as directed. Its
  request / user / admin identities may remain UUID, but it is part of the
  UUID-era migration set and must not be applied as an assumed compatible
  dependency.
- `supabase/proposed/006_cancel_tournament_refunds.sql` — **must be rewritten
  for bigint before application**: `p_tournament_id`, function grant/revoke
  identities, dry-run examples, and any audit target must accept bigint while
  `p_admin_id` remains UUID.
- `supabase/proposed/007_admin_audit_log.sql` — its UUID-only `target_id` is
  incompatible with logging tournament actions. Use a text target identifier or
  separate typed target columns before application.

Each existing file is header-stamped: **"NOT APPLIED. For the database phase."**
Nothing has been run. This document intentionally records the required rewrite;
it does not change or execute SQL.
