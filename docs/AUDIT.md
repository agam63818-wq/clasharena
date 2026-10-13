# ClashArena Security & Code Audit

**Scope:** GitHub application code only (`agam63818-wq/clasharena`). The live Supabase project was **not** inspected — every finding below is backed by repo evidence (file + line). Items that depend on database state are marked **"must verify in DB phase"**.

**Date:** 2026-10-11
**Reviewer note:** Line numbers refer to `src/App.jsx` (1531 lines), `api/joinTournament.js`, `api/deleteTournament.js` as of commit `d644ac7`.

---

## Remediation status (updated 2026-10-11)

| Phase | Status |
|---|---|
| **API hardening** | **Applied** — both routes authenticate via `Authorization: Bearer` (`api/_lib/auth.js`), identity comes only from the verified token, entry fee only from the tournaments table, raw DB errors never reach the client, safe validation on all inputs. RPC path (`JOIN_USE_RPC=true`) ready for the DB phase; legacy path documented as best-effort with optimistic lock + compensating refund. Client calls go through `src/lib/apiClient.js`. Closes P0-1, P0-2, P1-3 (code side). |
| **Client hardening** | **Applied** — `src/config/features.js` flags (rule 7); wallet transactions user-filtered + honest states (P0-5 client side); payment/withdraw buttons disabled with honest label, placeholder UPI/WhatsApp removed (P1-6, rule 4); profile-fetch failures surface an honest banner (P1-5); room-credentials RPC path ready behind `VITE_FEATURE_ROOM_RPC` (P0-3 client half); favicon 404 fixed (P2-5); `.env.example` documents client vs server-only vars. |
| **DB phase** | **Pending** — proposed, NOT applied SQL in `supabase/proposed/` (RLS, constraints, atomic `join_tournament`, room split). P0-3, P0-4 and the atomicity part of P0-6 fully close only in this phase. |

Verification: `npm test` → 38/38 passed (API routes, apiClient, feature flags; Supabase fully mocked). `npm run build` → vite build succeeded.

### Round 2 — RPC integration, server-side admin, signup role (2026-10-13)

| Item | Status |
|---|---|
| **RPC integration bug (P0-6 path)** | **Fixed in code + SQL** — `join_tournament` now takes `p_user_id uuid` and no longer uses `auth.uid()`; the API passes the id it verified from the bearer token (`api/joinTournament.js` → `joinViaRpc(res, supabase, user.id, …)`). EXECUTE revoked from `public, anon, authenticated` and granted to `service_role` only; the obsolete `(uuid, text, text)` overload is dropped. Cancelled/completed matches are rejected inside the function; the ledger insert is checked (raises → whole transaction rolls back). |
| **`get_room_details`** | **Unchanged by design, now documented** — it is called from the browser with the user JWT, so `auth.uid()` stays and it keeps its `authenticated` grant (docs/DB_REQUIREMENTS.md §3.2; in-file caller contract in `supabase/proposed/003_functions_triggers.sql` §3). |
| **Legacy join status guard** | **Fixed** — `status = 'cancelled'` now returns `409 This match has been cancelled. You have not been charged.` before any write (it previously joined a void match). |
| **Server-side admin (P1-2, P2-1)** | **Fixed in code** — one router, `api/admin.js` (`createTournament`, `updateTournament`, `listRegistrations`; single file, Vercel Hobby 12-function limit), `requireAdmin` on every action with the role read from `profiles`, full server-side validation, status-transition rules, capacity check against the DB's `current_players`, safe error messages. `AdminView.jsx` calls it through `src/lib/apiClient.js`; no UI redesign. `api/deleteTournament.js` unchanged. `current_players` is no longer client-writable. |
| **Signup role (P0-4 client half)** | **Fixed in code** — the signup profile insert no longer sends `role`; the value must come from the column default / protection trigger. Labelled DB-phase dependency added to docs/DB_REQUIREMENTS.md §2.1. |
| **Feature flags (rule 7)** | **Documented** — one flag table (README.md, mirrored in `.env.example`) listing `VITE_FEATURE_PAYMENTS`, `VITE_FEATURE_ROOM_RPC`, `VITE_FEATURE_WALLET_TRANSACTIONS`, `JOIN_USE_RPC`, `ENABLE_TOURNAMENT_CANCELLATION` with the DB object each one needs and its safe default. No new flag names were introduced. |

Verification (actually run): `npm test` → **89/89 passed** (`tests/admin.test.js` 43, `tests/api.test.js` 35, `tests/apiClient.test.js` 8, `tests/features.test.js` 3; Supabase mocked, no network). `npm run build` → **vite build succeeded** (`✓ built in 3.72s`). Nothing in `supabase/proposed/` has been applied to any database.

### Round 2b — wallet requests + tournament cancellation, all behind flags (2026-10-13)

| Item | Status |
|---|---|
| **Wallet requests (no gateway)** | **Added behind two flags** — client `VITE_FEATURE_WALLET_REQUESTS`, server `ENABLE_WALLET_REQUESTS`. `api/wallet.js` (one route) verifies the token, validates type/amount (₹1–₹50,000) and inserts a `pending` row whose `user_id` comes from the token; the body cannot set a status, a balance or a review. Per-user rate limit of 5/hour (`WALLET_REQUESTS_PER_HOUR`) enforced with a **database** count, with the serverless reasoning documented (docs/DB_REQUIREMENTS.md §3.5). The user's list shows pending/approved/rejected. |
| **Money movement** | **Only via the proposed RPCs** — `approve_wallet_request()` / `reject_wallet_request()` (`supabase/proposed/005_wallet_requests.sql`) update the request, the balance and the ledger row in one transaction, are idempotent, and are granted to `service_role` only. The route never writes a balance. If the RPC/table is missing the answer is an honest `503 requires database setup` — no fake success (rule 4). |
| **Admin review** | `api/admin.js` gained `listWalletRequests` (pending queue + usernames, best effort) and `approveWalletRequest` / `rejectWalletRequest`; `AdminView` renders the queue with approve/reject + note. |
| **Tournament cancellation** | `cancelTournament` action. No paid registrations → plain status change to `'cancelled'` (flag irrelevant). Paid registrations → only with `ENABLE_TOURNAMENT_CANCELLATION=true` **and** `cancel_tournament_with_refund()` (`supabase/proposed/006_cancel_tournament_refunds.sql`, atomic + idempotent + `service_role` only); otherwise `409` naming the exact reason and changing nothing. Refunds are never looped client-side. `AdminView` replaced hard delete with **Cancel** (confirm dialog + optional reason) and shows the server's message verbatim. |
| **Admin audit log** | **Best effort, never silent** — `api/_lib/audit.js` writes to `admin_audit_log` (`supabase/proposed/007_admin_audit_log.sql`, RLS on with zero policies; the `cancelled` status also needed a constraint replacement, 006 §2). When the table is missing the action still succeeds, the server logs a warning and the response says `auditLogged: false`. |
| **Support contact** | Read from `VITE_SUPPORT_WHATSAPP` / `VITE_SUPPORT_UPI` (`src/config/support.js`). Documented as **public** values: the UPI ID is display-only and is never used to verify a payment (rule 4). |
| **Transaction history** | Sign derived from the transaction `type` as an interim (`src/lib/transactions.js`, unit-tested) with the proper signed-amount convention documented for the DB phase (docs/DB_REQUIREMENTS.md §1.4); server-side pagination added (10 per page). |
| **Deletion** | `api/deleteTournament.js` is unchanged; the admin UI no longer calls it. |

Verification (actually run): `npm test` → **172/172 passed** (`tests/admin.test.js` 72, `tests/api.test.js` 35, `tests/wallet.test.js` 28, `tests/transactions.test.js` 21, `tests/apiClient.test.js` 12, `tests/features.test.js` 4; Supabase mocked, no network). `npm run build` → **vite build succeeded**. Still nothing in `supabase/proposed/` has been applied anywhere.

---

## P0 — Critical

### P0-1. `joinTournament` API trusts client-supplied `userId` and `entryFee`; endpoint has no authentication — wallet theft / free money
**File:** `api/joinTournament.js`

- Line 14: `const { userId, tournamentId, entryFee, ff_uid, ign } = req.body;`
- Lines 39–43: profile (balance) is fetched **by the client-supplied `userId`**.
- Lines 65–69: `if (profile.balance < entryFee)` … `const newBalance = profile.balance - entryFee;` — the **entry fee comes from the request body**, not from the tournament row.
- Lines 72–75: that balance is written back to any profile.

Consequences, with the endpoint as written:
1. **Balance injection:** `POST /api/joinTournament` with `{ userId: <any profile id>, tournamentId: <any>, entryFee: -50000 }` passes the "insufficient balance" check (balance is always ≥ a negative fee) and **increases** the target profile's balance by 50,000. `entryFee: 0` gives free joins for everyone.
2. **No caller identity check:** the handler never verifies a Supabase JWT or that `userId` belongs to the caller. Anyone who can reach the URL acts on behalf of **any** user.
3. The genuine fee for the tournament (`tournaments.entry_fee`) is available in the same DB and is already fetched at lines 50–54 (only `id, current_players, max_players` are selected) — the client value is used instead.

**Fix direction (DB phase + later code phase):** derive fee server-side from the tournament row; authenticate the caller via the Supabase JWT (`Authorization: Bearer`) and use `auth.uid()` — never a body field. Ultimately, move the whole join into a single atomic DB function (see P0-6 and `docs/DB_REQUIREMENTS.md`).

---

### P0-2. `deleteTournament` API authorizes admin by trusting the client-supplied `userId`
**File:** `api/deleteTournament.js`

- Line 14: `const { tournamentId, userId } = req.body;`
- Lines 19–30: the admin check is `profiles.role` of **the `userId` from the request body**. No JWT verification.

Consequence: any unauthenticated caller who knows (or guesses) **any admin's profile UUID** can pass `userId: <admin-uuid>` and delete any tournament **plus every registration for it** (lines 32–44). Registrations are deleted with no refund and no ledger entry, so users lose both entry and money. This is exactly "UI hiding ≠ authorization" violated on the server: the admin gate in the UI (`src/App.jsx:1371`, `1074`) is cosmetic, and the one server-side gate present is bypassable.

**Fix direction:** authorize from the caller's JWT (`auth.uid()` → role lookup or JWT app_metadata claim), never from a body field.

---

### P0-3. Room ID / room password are delivered to every user for every tournament
**File:** `src/App.jsx`

- Line 363: `supabase.from('tournaments').select('*')` — the home list fetch pulls **all columns**, including `room_id` and `room_password`, for all tournaments, for every signed-in user.
- Lines 653–654: the detail view only **renders** room credentials when `alreadyJoined` is true — a UI gate. The data is already in the browser's network payload for non-joined users, and `alreadyJoined` itself is just a client-side query (lines 568–574).
- `MyMatchesView` (lines 1403–1417) correctly selects a column list, but the leak at line 363 covers the app.

**Fix direction (DB phase):** move `room_id`/`room_password` out of the publicly readable shape — either a column-privilege split or (recommended) a separate `tournament_room_credentials` table readable only via a security-definer function that verifies registration. See `docs/DB_REQUIREMENTS.md` (R-4, R-11).

---

### P0-4. Every client-side mutation runs with the public anon key; authorization depends entirely on RLS that the repo cannot prove
**File:** `src/lib/supabaseClient.js` (lines 6–7) + all direct client queries

The anon key is public by design. Therefore **every** direct client operation is only as safe as the database's RLS policies, which the repo cannot demonstrate:

| Operation | Evidence | Required DB protection |
|---|---|---|
| Profile insert on signup (incl. `role` field) | `src/App.jsx:152–159` | insert restricted to `id = auth.uid()`; role forced to `'user'` |
| Profile update (ff_id, nickname, avatar_url) | `src/App.jsx:763–770` | update own row **only on those columns** — otherwise a malicious client updates its own `balance`, `role`, `wins` |
| Admin tournament create | `src/App.jsx:1098–1108` | insert restricted to server/admin |
| Admin tournament update | `src/App.jsx:1122–1129` | update restricted to admin |
| Admin read of **all** registrations | `src/App.jsx:1054–1072` | select restricted to admin (contains other users' FF UID/IGN) |
| Balance / role writes by users | implicit | must be impossible via client |

Note on the specific suspect "signup inserts role from the client": the code **hardcodes** `role: 'user'` (`src/App.jsx:158`) — the role value itself is not client-controlled *in this code*. However, since the insert happens client-side with the anon key, a malicious client can insert a profile with `role: 'admin'` directly against the Supabase REST API **if** the DB lacks a policy/constraint blocking it. The fix belongs in the DB layer (policy + trigger), which is proposed in `supabase/proposed/003_rls_policies.sql`. **Must verify in DB phase.**

---

### P0-5. Wallet view fetches **all users'** transactions
**File:** `src/App.jsx`

- Line 684: `supabase.from('transactions').select('*').order('created_at', ...)` — **no `.eq('user_id', ...)` filter**. Every user's wallet renders the full financial ledger of the platform (subject to RLS; if RLS blocks it, the wallet silently shows "No transactions yet" — a broken feature either way).

**Fix direction:** client filter (code phase) **and** a transactions RLS policy limiting select to `user_id = auth.uid()` (DB phase, `supabase/proposed/003_rls_policies.sql`).

---

### P0-6. Join flow is multi-step and non-atomic — money can be deducted with no registration, counts and ledger drift
**File:** `api/joinTournament.js` (steps 5–8)

The operation is four separate awaits with no DB transaction:

1. **Balance update** — lines 72–75 (read at 39–43, write 72–75).
2. **Registration insert** — lines 82–90.
3. **Player-count recount + write** — lines 100–112.
4. **Ledger insert** — lines 119–124.

Concrete failure modes:

- **Money lost on duplicate join:** if the registration insert fails (e.g. the unique-violation path at lines 93–95, or any other insert error), the balance was **already deducted** at line 72 and is never refunded. The user is poorer with no registration.
- **Lost-update race on balance:** read-modify-write of `balance` is not guarded (`newBalance` computed from a stale read). Two concurrent joins by the same user against different tournaments can both pass the balance check with the same snapshot and drive the balance **negative**.
- **Capacity race (TOCTOU):** the full-check at lines 60–62 happens before the insert; N concurrent joins can all pass it. The recount at lines 100–112 then just records `current_players > max_players` — it never reverts the excess joins.
- **Silent ledger failure:** the transaction insert at line 119 does not check its error — money movement can occur with no ledger entry (violates rule 4's "no invented transactions" from the opposite direction: missing ones).
- **Count write failure** (line 114) returns an error to a user who is already registered and already charged — client shows "Unable to join match right now" while the join actually succeeded.

**Fix direction:** a single security-definer Postgres function `join_tournament(p_tournament_id, p_ff_uid, p_ign)` doing check → deduct → insert → count in one atomic unit with row locking; the API route (authenticated) calls it via RPC. Proposed in `supabase/proposed/004_functions_triggers.sql`.

> **Update (2026-10-13, round 2):** implemented in `supabase/proposed/003_functions_triggers.sql` §2 with the signature `join_tournament(p_user_id uuid, p_tournament_id uuid, p_ff_uid text, p_ign text)` — see the round-2 table at the top of this document for why the identity is a parameter (service-role callers have no `auth.uid()`).

---

## P1 — High

### P1-1. Rule 7 violated: no feature flags, no graceful degradation when DB/env is missing
- `src/config/features.js` does not exist (no file in repo).
- `api/joinTournament.js:3–6` and `api/deleteTournament.js:3–6` call `createClient(process.env.SUPABASE_URL, ...)` at **module load**; if either env var is absent on Vercel, `createClient` throws at import time and the function 500s with no honest message.
- All DB-dependent UI (wallet, joins, admin) renders unconditionally with no "feature unavailable" state.

### P1-2. Admin create/update goes directly from the browser to Supabase with the anon key
`src/App.jsx:1098–1108` (create) and `1122–1129` (update) are anon-key client writes. The only server-side protections possible are RLS admin policies (DB phase). Until those are verified, admin CRUD is protected solely by client state (`isAdmin`, `src/App.jsx:395`). Registration listing for admins (`1054–1072`) similarly exposes all users' FF UID/IGN if RLS is absent.

### P1-3. Raw database error messages are returned to clients
- `api/joinTournament.js:31, 46, 57, 115` — raw PostgREST/Postgres `error.message` values (table names, constraint names, column details) go to the browser.
- `api/deleteTournament.js:26, 37, 46, 52` — same, including the catch-all at line 52.

### P1-4. No rate limiting or abuse controls on API routes
Both handlers (`api/joinTournament.js`, `api/deleteTournament.js`) accept unlimited anonymous POSTs. Even after P0-1/P0-2 fixes, an unauthenticated script can stuff tournaments to capacity. Needs rate limiting and (primarily) authentication.

### P1-5. Signup can orphan the auth user; profile fetch swallows errors
- `src/App.jsx:141–170`: `auth.signUp` succeeds first; the profiles insert then runs as a separate client call. If it fails (username duplicate is one path), the auth user exists with **no profile**.
- `src/App.jsx:351–354`: `fetchProfile` ignores the `error` field — the orphaned user logs in to `userProfile === null`, `role` undefined, balance rendered as ₹0, admin tab hidden. No message tells the user anything is wrong.
- Username uniqueness error handling sniffs the message text: `.includes('duplicate')` (line 163) — fragile across Postgres/PostgREST error formats; also no client-side uniqueness pre-check.
- Phone is regex-validated for Indian formats only (line 129) and stored as a raw string; no length caps on username/phone.

### P1-6. Placeholder payment values and a manual, untracked payment flow (rule 4 exposure)
- `src/App.jsx:694`: Add Money button shows `alert('UPI: yourupi@paytm\nSend screenshot on WhatsApp')` — hardcoded **placeholder UPI ID**.
- `src/App.jsx:695`: Withdraw button shows `alert('Min ₹100\nWhatsApp: 9999999999')` — hardcoded **placeholder WhatsApp number**.
- No add-money or withdraw request is ever recorded (no DB writes), so balances change only manually outside the app, while the ledger only ever records `join` debits. The Terms page meanwhile states "All payments are processed through secure third-party providers" (`src/pages/Terms.jsx:39`) — a claim the app does not fulfill. This is the highest-priority *product-honesty* item: the buttons do something (an alert) but the money flow is not real, verifiable, or auditable.

### P1-7. Balance checks in the client only; stale client state drives the join UI
`src/App.jsx:580` (`userProfile.balance < tournament.entry_fee`), `566`, `586–587` — all client-side, against data fetched at page load. Fine as UX; the server-side equivalents are the ones that matter and they are the broken ones (P0-1, P0-6). Listed to make explicit that fixing the client is not the fix.

---

## P2 — Medium / hygiene

### P2-1. Admin edit form round-trips the entire tournament row
`src/App.jsx:1155` (`{ ...t, match_time: ... }`) copies `room_password`, `current_players`, etc. into form state, and `handleUpdate` (`1122–1129`) spreads `...form` back — every admin edit rewrites `current_players` with the value from whenever the list was loaded, clobbering the recount done on each join (joinTournament.js:100–112). Also keeps the room password in component state unnecessarily.

### P2-2. No pagination / limits on list queries
`tournaments` (`src/App.jsx:363`), `transactions` (`684`), all `match_registrations` for admin (`1056–1059`) — unbounded selects; tables will degrade the UI as data grows.

### P2-3. Ledger sign semantics are inconsistent
Joins insert `amount: entryFee` **positive** with `type: 'join'` (`api/joinTournament.js:119–124`), while the wallet colors only `amount < 0` red (`src/App.jsx:708`) — debits display as green income. Either store debits negative or branch on `type` in the UI.

### P2-4. Third-party avatar services receive user identifiers
`https://i.pravatar.cc/150?u=${session.user.id}` (`src/App.jsx:400`) and DiceBear seeded with the username (`829`) send auth UUIDs / usernames to external services on every render.

### P2-5. Missing favicon asset reference
`index.html:7` points to `/vite.svg`, but only `public/favicon.svg` exists — 404 in console on every load.

### P2-6. Repo hygiene
- `clasharena-fixed (1).zip` (738 KB duplicate snapshot of the codebase) is committed. Its file list was checked — **no `.env` or secret files inside** — but it is dead weight and will drift.
- `attached_assets/` contains pasted AI-prompt transcripts and screenshots (several hundred KB) tracked in git.
- `README.md` says port 5000 and "npm run dev kills port 5000"; `vite.config.js` actually uses 5173 strictPort and `.replit` confirms 5173. Docs drift.
- `.gitignore` correctly ignores `.env*` and no `.env` is tracked (verified via `git ls-files`). `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are necessarily shipped to the browser — acceptable by design, but that is exactly why P0-4's RLS list is mandatory.

### P2-7. `console.error` of raw errors
`src/App.jsx:1062`, `1421` log raw Supabase errors (fine in dev; keep message-only in prod).

---

## Suspect verification summary (as requested)

| Suspect | Verdict | Evidence |
|---|---|---|
| `joinTournament` trusts `userId`/`entryFee` from body | **Confirmed (P0-1)** | `api/joinTournament.js:14, 39–75` |
| `deleteTournament` trusts `userId` for admin check | **Confirmed (P0-2)** | `api/deleteTournament.js:14, 19–30` |
| Join is multi-step, not atomic | **Confirmed (P0-6)** | `api/joinTournament.js:72–124` |
| Signup inserts role from the client | **Not as stated** — role is hardcoded `'user'` (`src/App.jsx:158`); the real risk is that the insert is client-side with the anon key, so `role='admin'` can be injected unless the DB blocks it (P0-4) | `src/App.jsx:152–159` |
| `room_id`/`room_password` fetched with `select('*')` for everyone | **Confirmed (P0-3)** | `src/App.jsx:363` (UI gate only at 653–654) |
| Wallet transactions query has no user filter | **Confirmed (P0-5)** | `src/App.jsx:684` |
| Hardcoded placeholder UPI / WhatsApp values | **Confirmed (P1-6)** | `src/App.jsx:694–695` |

## Verification status of this audit part
- No functional code was changed in this part; no build was run and none is claimed.
- All findings above are static analysis against the repo at commit `d644ac7`.

## Suggested fix order (for approval, later parts)
1. **DB phase:** apply reviewed migrations from `supabase/proposed/` (RLS, constraints, atomic `join_tournament` RPC, room-credential protection, indexes).
2. **API phase:** JWT-authenticate both routes, use server-derived fee + `auth.uid()`, call the RPC, stop leaking raw DB errors, env guards + honest 503 responses.
3. **Client phase:** `src/config/features.js` flags, user-filtered wallet query, room credentials fetched only via the secure function, honest payment flow or clearly-labelled disabled state.

---

## Round 3 — measured numbers (2026-10-13, Part 4)

Everything in this section was **run in this repository** and the output was
observed. Nothing here is estimated, and the one item that could not be run is
labelled as not run.

### Build and quality gates (exact output)

| Command | Result |
|---|---|
| `npm ci` | installs from the lockfile, no changes |
| `npm run lint` (ESLint 9 flat config) | exit 0, **0 problems** |
| `npm test` (Vitest) | **6 files, 172 tests passed**, ~1.7 s |
| `npm run build` | success, 7 files in `dist/` |
| `npm audit` | 13 vulnerabilities → 6 after `npm audit fix` (2 critical, 1 high, 3 moderate) — **all dev-only** (`vite`, `vitest`, `tinypool`, `esbuild`, `vite-node`, `@vitest/mocker`); each remaining fix is a semver-major (`--force`), not applied |
| `npm audit --omit=dev` | **0 vulnerabilities** |

### Bundle (measured with `find dist -type f -printf` + `gzip -9 -c`)

| File | Raw | Gzipped |
|---|---|---|
| `index-*.js` (app) | 251,513 B | 65,384 B |
| `vendor-motion-*.js` | 134,803 B | 44,197 B |
| `vendor-react-*.js` | 133,935 B | 42,951 B |
| `AdminView-*.js` (lazy) | 23,439 B | 6,207 B |
| `index-*.css` | 22,352 B | 4,708 B |
| `favicon.svg` + `index.html` | 2,370 B | 1,271 B |
| **Total (7 files)** | **568,412 B** | **164,718 B** |

### Secret exposure in the shipped bundle (both with and without env vars set)

| Pattern | Occurrences in `dist/` |
|---|---|
| `SERVICE_ROLE`, `service_role`, `serviceRoleKey`, `supabaseAdmin` | **0** |
| `VITE_` names readable in client JS | 5: the four feature flags + two support vars |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` *names* | 0 (Vite inlines their **values**; the anon key is public by design, the service-role key is absent) |

A build made with dummy `VITE_*` values confirms the same negative result for
every `service_role`-related pattern.

### Accessibility — measured contrast (WCAG 2.1 AA)

Contrast ratios computed from the declared tokens in `src/App.css`:

| Pair | Ratio | Verdict |
|---|---|---|
| `--text-primary` on `--bg-elevated` | 15.99 | AA |
| `--text-secondary` on `--bg-surface` | 8.54 | AA |
| `--accent-text` on `--bg-surface` | 8.01 | AA |
| `--danger-text` / `--success-text` on surfaces | 7.70 / 9.74 | AA |
| `--text-muted` (#737b8c → **#828a9c**) on `--bg-surface` | 4.38 → **5.37** | **FIXED 2026-10-13** (was below 4.5; used at 11–13 px in several labels) |
| white (#fff) → **(#1a0a00)** on `.btn-primary`'s orange gradient | 3.33 → 2.86 · now **5.81 → 6.76** | **FIXED 2026-10-13** (button label is 16 px/800 → not "large text") |
| `--text-muted` (#828a9c) on `.badge--cancelled`'s composited bg (`rgba(255,255,255,0.05)` over `--bg-elevated` ≈ #242431) | 3.60 → **4.42** | **still below 4.5** — residual, not fixed (see below) |
| white (#fff) on `--danger` (#ef4444) — `.badge--live`, `.status-badge.live`, `.live-badge--live` | **3.76** | **below 4.5** — new finding, not in the approved change set |
| white (#fff) on `--accent` (#ff4d00) — `.skip-link` | **3.33** | **below 4.5** — new finding, keyboard-only element |
| white (#fff) on `--accent` (#ff4d00) — `::selection` | **3.33** | below 4.5; browser selection styling, lowest priority |

**Applied (approved 2026-10-13):**

- `--text-muted: #737b8c` → `#828a9c` — measured 5.06 worst case
  (`--bg-elevated`), 5.37 on `--bg-surface`, 5.58 on `--bg-inset` (input
  placeholders/icons), 5.69 on `--bg-frame` (empty states, bottom nav).
- `.btn-primary { color: #fff }` → `#1a0a00` — measured 5.81 on the `#ff4d00`
  gradient stop and 6.76 on `#ff6b00` (worst stop governs).

**Residual (needs a decision, NOT changed):**

- `.badge--cancelled` sits on `rgba(255,255,255,0.05)` over a card, so the same
  `--text-muted` token only reaches **4.42** there (lightest case: over
  `--bg-elevated` ≈ #242431). Two one-line options: darken that badge's own
  background (e.g. `rgba(0,0,0,0.35)`) or give it a slightly lighter text colour.
- The `--danger` "live" badges (white on #ef4444, **3.76**), `.skip-link`
  (3.33) and `::selection` (3.33) were found while measuring and are outside the
  approved change set — reported, not modified.

Lint-level a11y (`eslint-plugin-jsx-a11y`) is clean (0 problems) and cannot see
either of the above — contrast is not a static-analysis rule here.

### Other a11y / layout facts (static review, not browser-verified)

- All three `<img>` elements carry `alt=""` and are decorative (card media,
  avatars with adjacent text) — correct, and `loading="lazy"`/`decoding="async"`
  are set.
- Global `:focus-visible { outline: 2px solid var(--accent) }` exists; forms have
  associated labels; the login fields gained explicit `aria-label`s in Part 4.
- `@media (prefers-reduced-motion: reduce)` neutralises animation and transition
  durations.
- `index.html`'s viewport was
  `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no`,
  which **blocked pinch-zoom** (WCAG 1.4.4 failure). **FIXED 2026-10-13:** it is
  now `width=device-width, initial-scale=1.0` — `maximum-scale` and
  `user-scalable` removed, nothing else touched.
- Breakpoints exist at 500–1023 / 768 / 1024 / 1280 px; global guards
  `overflow-x: hidden`, `img { max-width: 100% }`, `* { box-sizing: border-box }`.
- Bottom-nav tap target: 22 px icon + 4 px gap + ~13 px text line (11 px font,
  browser-default line-height) + 8 px padding ≈ **47 px** — above the 44 px
  guideline, but computed from declared values, **not measured in a browser**.

### Not run

- **Lighthouse (performance and accessibility):** not runnable in this
  environment — no Chrome/Chromium binary is installed and Puppeteer's browser
  download is blocked. Run it against a deployed URL:
  `npx lighthouse <url> --only-categories=performance,accessibility --view`.
  No Lighthouse score is claimed anywhere in this repository.
- **Real-device / real-viewport layout check (360 / 768 / desktop):** the review
  above is static (CSS + markup). It is **not** a substitute for opening the app
  in a browser — see SMOKE_TEST.md §8.1–8.3.
