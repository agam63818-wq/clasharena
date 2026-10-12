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
| `role` | `text not null default 'user'` | [required by code] | read `App.jsx:395` (`isAdmin`), `:847`; written `'user'` at `:158`; compared `'admin'` in `api/deleteTournament.js:28` |
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
| `name` | `text not null` | [required by code] | form `App.jsx:1016`; validation `:1087, 1120` |
| `mode` | `text not null default 'Solo'` | [required by code] | `App.jsx:1022–1024` (Solo/Duo/Squad/1v1), display `:546, 634` |
| `prize` | `numeric(12,2) not null default 0` | [required by code] | `App.jsx:1102` (`Number(form.prize)`), display `:540, 622` |
| `entry_fee` | `numeric(12,2) not null default 0` | [required by code] | **must be the authoritative fee** — currently bypassed by the API trusting the client (`api/joinTournament.js:14, 65`); display `App.jsx:547, 633, 647` |
| `max_players` | `int not null default 100` | [required by code] | `App.jsx:1104`, capacity checks `api/joinTournament.js:60`, `App.jsx:587` |
| `current_players` | `int not null default 0` | [required by code] | recount write `api/joinTournament.js:109–112`, display `App.jsx:542, 635` |
| `status` | `text not null default 'registration'` | [required by code] | form values `App.jsx:1026` (`registration/upcoming/live`), also `'completed'` in `statusColor` `:1166`; badge classes `:536, 620` |
| `match_time` | `timestamptz` | [required by code] | `App.jsx:1105, 1127` (ISO string written), display `:543, 636, 1281` |
| `room_id` | `text` | [required by code] — but **read access must be restricted** (see §2.2) | set by admin form `App.jsx:1032`, revealed `:653` |
| `room_password` | `text` | [required by code] — same restriction | `App.jsx:1033, 654` |
| `image_url` | `text` | [required by code] | `App.jsx:1106, 1128`, display `:534, 618` |
| `rules` | `text` | [required by code] | `App.jsx:1036, 641` |
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

Semantics to settle in the DB phase **[recommended]**: decide debit/credit sign convention (wallet colors only `amount < 0` red — `App.jsx:708`; joins currently written positive, audit P2-3), and a `check (amount <> 0)`.

---

## 2. Row Level Security

> The Supabase anon key is shipped to every browser (`src/lib/supabaseClient.js:6–7`), so **RLS is the only thing standing between any visitor and full read/write on these tables.** The service-role key used by `api/*` bypasses RLS entirely — every policy below is written for the `anon`/`authenticated` roles.

### 2.1 `profiles`
- **SELECT**: `user_id = auth.uid()` — [required by code] (own profile fetch `App.jsx:352`). Admin read-all — [recommended] only if a feature needs it (none today; the admin "registered players" view reads `profiles(username)` **through** `match_registrations`, see §2.3).
- **INSERT**: `id = auth.uid()` — [required by code] (signup insert `App.jsx:152–159`). Plus a trigger forcing `role = 'user'` on any insert/update performed by a non-service-role session — [recommended, closes audit P0-4].
- **UPDATE**: `id = auth.uid()` restricted to columns `ff_id, nickname, avatar_url` — [required by code] (`App.jsx:763–770`); since RLS cannot restrict columns, enforce with a BEFORE UPDATE trigger that rejects changes to `role, balance, wins, level, username` unless `auth.role() = 'service_role'` — [recommended, closes P0-4]. Alternative: move profile editing into an authenticated API route.
- **DELETE**: none for clients — [recommended].

### 2.2 `tournaments`
- **SELECT**: all authenticated users — [required by code] (home list `App.jsx:363`, detail, MyMatches `:1403–1417`). **But** `room_id`/`room_password` must not be world-readable: the code's `select('*')` makes this a P0-3 leak today. Recommended shape:
  - **[recommended]** new table `tournament_room_credentials (tournament_id uuid PK/FK, room_id text, room_password text)` + `security definer` function `get_room_details(p_tournament_id)` returning the row **only** when a `match_registrations` row exists for `auth.uid()`; keep the columns on `tournaments` readable only to admins (column-level privileges or view) until the client stops using `select('*')`.
  - Minimal (matches current behavior, closes nothing): plain select-all. Not recommended.
- **INSERT / UPDATE / DELETE**: admin only (role from profile or JWT claim) — [required by code for safety]: the client performs admin insert `App.jsx:1098–1108`, update `:1122–1129`; delete currently goes through the API with a service-role key (P0-2 must be fixed separately — RLS does not help there because service role bypasses it). Status values constrained to `('registration','upcoming','live','completed')` — [recommended, matches `App.jsx:1026, 1166`].

### 2.3 `match_registrations`
- **SELECT**: own rows (`user_id = auth.uid()`) — [required by code] (MyMatches `App.jsx:1418`, duplicate check `:571, 583`); **admin read-all** — [required by code] (admin view `App.jsx:1054–1072`, including the embedded `profiles(username)` join, which additionally needs the profiles policy to allow that nested read for admins — [required by code]).
- **INSERT**: own rows, `user_id = auth.uid()` — [required by code] (signup of a registration happens only via the API's service role today, but the unique-violation path implies direct inserts must not be client-writable: actually the API insert uses the service-role client and bypasses RLS, so the client-facing policy is **[recommended]**: deny client inserts entirely once the atomic RPC exists — see §3.1).
- **UPDATE**: none for clients — [recommended].
- **DELETE**: none for clients (admin cleanup should go through the API/RPC) — [recommended].

### 2.4 `transactions`
- **SELECT**: `user_id = auth.uid()` — [required by code] (wallet `App.jsx:684`; today's code omits the filter, which is audit P0-5 — the DB policy is the authoritative fix).
- **INSERT / UPDATE / DELETE**: none for clients; only the server's service role writes (`api/joinTournament.js:119–124`) — [required by code for safety] (service role bypasses RLS, so plain absence of policies achieves this).

---

## 3. Functions

### 3.1 `join_tournament(p_tournament_id uuid, p_ff_uid text, p_ign text) returns json` — **[recommended, closes audit P0-1 + P0-6]**
`security definer`, runs as owner, called by the (JWT-authenticated) API route. Single transaction:
1. `v_uid := auth.uid()` — caller identity from the JWT, never a parameter.
2. Lock tournament row (`FOR UPDATE`); reject unless `status = 'registration'` (or per product rules) and `current_players < max_players` — removes the TOCTOU capacity race.
3. Lock profile row (`FOR UPDATE`); derive fee from `tournaments.entry_fee` (server-side, not client).
4. Check `balance >= entry_fee`; update balance.
5. Insert `match_registrations` (unique constraint still the duplicate backstop; map `23505` to "already joined" for backward compatibility with the client's handling at `App.jsx:596`).
6. `current_players := current_players + 1` (same locked transaction, no recount window).
7. Insert the `transactions` ledger row (checked, not fire-and-forget).
8. Return the same success/error JSON shape the API uses today (`{ success: true }` / `{ error }`) to keep response shapes backward compatible (permanent rule 5).

### 3.2 `get_room_details(p_tournament_id uuid) returns record` — **[recommended, closes P0-3]**
`security definer`; returns `room_id, room_password` only if a `match_registrations` row exists for `auth.uid()` + the tournament; otherwise null.

### 3.3 `protect_profiles_sensitive_columns()` trigger — **[recommended, closes P0-4]**
BEFORE INSERT/UPDATE on `profiles`; when `auth.role() <> 'service_role'`, force `new.role = 'user'` on insert and raise on attempts to change `role, balance, wins, level` on update.

### 3.4 `sync_current_players()` trigger — **[recommended, defense-in-depth]**
AFTER INSERT/DELETE on `match_registrations`: increment/decrement `tournaments.current_players`. If §3.1 is adopted, this trigger is redundant for the RPC path but protects any other write path (e.g. admin manual inserts).

### 3.5 `set_updated_at()` trigger — **[recommended]** (standard `updated_at` maintenance) — optional.

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

---

## 5. Environment / platform requirements (server)

| Item | Label | Reason |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set as Vercel **server** env vars | **[required by code]** | `api/joinTournament.js:3–6`, `api/deleteTournament.js:3–6` (never prefixed `VITE_`) |
| Service-role key **never** in `VITE_*` vars or client bundle | **[required by code]** | permanent rule 1; `VITE_` vars are inlined into the public JS bundle |
| Guarded module init: honest 503 with `{ error: 'Service temporarily unavailable' }` when env vars are missing | [recommended] | permanent rule 7; today a missing env var throws at import time (audit P1-1) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in client env | **[required by code]** | `src/lib/supabaseClient.js:6–7` |

---

## 6. Backward-compatibility contract (permanent rule 5)

Any DB-phase change must preserve:
- `POST /api/joinTournament` responses: `{ success: true }` on 200; `{ error }` on failures; `{ error: 'Already joined', code: '23505' }` on duplicates (client branch `App.jsx:596`).
- `POST /api/deleteTournament` responses: `{ success: true }` / `{ error }`.
- Table/column names and types as listed in §1 (the client uses `select('*')` in several places, so renaming/removing columns breaks the UI).
- `tournaments.status` values `registration|upcoming|live|completed` and `profiles.role` value `admin` — the UI branches on these literal strings (`App.jsx:395, 536, 1166, 1492`).

## 7. Proposed (not applied) migrations

- `supabase/proposed/001_tables_constraints.sql` — tables (if missing), columns, constraints, unique indexes.
- `supabase/proposed/002_rls_policies.sql` — enable RLS + policies per §2.
- `supabase/proposed/003_functions_triggers.sql` — `join_tournament`, `get_room_details`, profile-protection trigger, count trigger.
- `supabase/proposed/004_room_credentials_split.sql` — room-credential table + column lockdown (optional companion to `get_room_details`).

Each file is idempotent (precondition-checked) and header-stamped: **"NOT APPLIED. For the database phase."** Nothing has been run.
