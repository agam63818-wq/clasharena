# ClashArena — Project State

**Last updated:** 2026-10-17 (Asia/Kolkata)

**Working branch:** `feat/razorpay-server` — a new branch cut from the latest
`main` (`9b9abe2`, after the bigint fix in PR #10 was merged), created per the
user's explicit instruction for the Razorpay wallet top-up release (part R1).
The user has asked for PRs to be opened ONLY when they say so; this branch is
pushed but has NO pull request yet.

**History:** the bigint tournament-ID fix (branch `fix/bigint-tournament-ids`)
was merged into `main` via PR #10. Its notes remain below under the bigint
heading.

## Mandatory new-session handoff

Before any future task, read `replit.md`, this file, and
`docs/DB_REQUIREMENTS.md`; then write a **10-line understanding summary** and
wait for the user's task. Do not begin inspection, edits, commands, SQL, or a
deployment before that task arrives.

## Authoritative database facts

The project owner supplied these deployed facts; they override UUID-era
assumptions in code and proposed migrations:

- `tournaments.id` and `match_registrations.id` are **bigint**. Tournament
  foreign keys and tournament RPC parameters must be bigint-compatible.
- `tournaments.prize` is **numeric(12,2)**.
- The deployed results writer is
  `admin_set_tournament_results(p_tournament_id bigint, p_admin_id uuid, p_results jsonb) -> jsonb {success, error}`.
- Profile/user identities remain UUID. Phone numbers are private and must never
  appear in ordinary player-facing profile or result data.
- Result prizes are recorded standings only; wallet payouts remain manual.

## Current implementation and documentation work

### Razorpay R1 — server (2026-10-17, this branch)

Scope honored: wallet top-up deposits only (no withdrawals/payouts/refunds),
test mode first, no new npm dependency (Node `crypto` + `fetch`), no SQL, no
flag values changed. Exactly 2 functions added (project now has 7 of 12 on
Vercel Hobby):

- `api/payments.js` — one POST router (`createOrder` / `verify` /
  `listPayments`). Every action runs behind `ENABLE_PAYMENTS !== 'true' → 503`
  and `requireUser` (identity from the Bearer token only).
  - `createOrder`: whole rupees 10–5000 (constants at top); Razorpay Orders
    API with Basic auth; a `payments` row is written with the VERIFIED user,
    Razorpay's own order id/amount, `status: 'created'`; rate limit of 5
    created orders / 10 min per user → 429; responds
    `{ orderId, amountPaise, currency, keyId }` — never the secret.
  - `verify`: format checks (≤64 chars, alphanumeric+underscore) → order row
    by `provider_order_id` with `user_id === verified user` (else 404) →
    HMAC-SHA256 signature over `order|payment` via `timingSafeEqual` (bad →
    400, nothing credited) → Razorpay payment GET; only `captured` proceeds
    (`authorized` → `{ status: 'pending' }`), order/amount/currency must match
    the recorded row using RAZORPAY'S values → `credit_payment` RPC with
    `p_event_id: 'verify:<payment_id>'` → `{ status: 'credited' |
    'already_credited' | 'pending', balance }`.
  - `listPayments`: caller's last 20 payment rows.
- `api/razorpayWebhook.js` — POST only, no user auth; body parser disabled
  (`export const config = { api: { bodyParser: false } }`) and the raw stream
  bytes are read, so the HMAC-SHA256 signature (header `x-razorpay-signature`)
  is verified against exactly what Razorpay signed; JSON parsed only after the
  check. `payment.captured` → `credit_payment` with the
  `x-razorpay-event-id` header: success/duplicate → 200; 'Unknown order' /
  'Amount mismatch' / 'Currency mismatch' / 'Payment already used' → 200 +
  console.error with ids only; DB/transport error → 500 so Razorpay retries
  (idempotent). `payment.failed` → `status: 'failed'` + short reason ONLY
  where the order exists and `status = 'created'` (credited payments are
  never touched). Any other event → 200 ignored.
- `tests/payments.test.js` — 41 tests: flag off, missing keys, 401s, bad
  amounts, client-supplied user_id/amount_paise/currency ignored, rate-limit
  429, gateway 502s, other user's order 404, bad/tampered signature, not
  captured / authorized / amount-currency mismatch, duplicate verify
  (duplicate RPC verdict and already-credited row), listPayments user filter
  and limit, webhook bad signature, raw-body tamper proof (re-serialized JSON
  fails), valid captured credit with event id, duplicate event, unknown order,
  amount mismatch logging, retry-on-500, failed-payment status filter, secret
  never logged.

The deployed `credit_payment(p_provider_order_id, p_provider_payment_id,
p_amount_paise, p_currency, p_event_id)` RPC remains the ONLY path a payment
becomes balance. Balance, transactions and payments.status are never written
any other way here.

### Bigint tournament-ID fix (2026-10-17, merged via PR #10)

Prior arena-session work (signup/profile completion, admin tournament
management, player match details, phone-required joining, results management)
was merged into `main` via PR #9.

This branch closes open item 1 below — the bigint application-compatibility
gap that made every tournament-id route answer `400 "Invalid tournament."`:

- `api/_lib/validate.js` `validateTournamentId` now accepts a positive integer
  (number, or digits-only string matching `/^[1-9][0-9]{0,14}$/`, safe integers
  only) and returns a **Number**; UUID strings and every other shape are
  rejected with `400 "Invalid tournament."`. This unblocks `joinTournament`,
  `deleteTournament`, and admin `getTournament` / `updateTournament` /
  `deleteTournament` / `cancelTournament` / results for the deployed bigint ids.
- `api/_lib/audit.js` stringifies `target_id` (empty → `null`) because the
  audit-log column is TEXT while tournament targets are bigint.
- `src/App.jsx` `openTournament()` accepts a numeric id candidate, not just a
  string, so numeric ids from data navigate the same as string ids.
- Tests: `tests/helpers.js` `TOURNAMENT_ID` is now the number `4242`; the admin
  audit assertion expects `String(TOURNAMENT_ID)`; new
  `tests/tournamentId.test.js` (20 regression tests) covers accepts/rejects
  (uuid, zero, negatives, floats, `'1e3'`, `'007'`, whitespace, null, objects,
  unsafe integers, over-long).
- `docs/DB_REQUIREMENTS.md` notes that described the UUID-only validator as an
  open gap were updated to record the closure. No SQL was written, edited, or
  run; `supabase/proposed/` is untouched.

### Verification status (real runs, 2026-10-17)

For R1 on `feat/razorpay-server`:

- `npm run lint` — passed (exit 0).
- `npm run build` — passed with Vite 5.4.21; 2,182 modules transformed.
- `npm test` — passed: **11 test files, 286 tests** (245 before; 41 new in
  `tests/payments.test.js`). The suite deliberately logs mocked failure paths
  to stderr; process exit was 0.

For the merged bigint fix (`fix/bigint-tournament-ids`, PR #10):

- `npm run lint` — passed (exit 0, eslint reported nothing).
- `npm run build` — passed with Vite 5.4.21; 2,182 modules transformed.
- `npm test` — passed: **10 test files, 245 tests** (was 225 before;
  `tests/tournamentId.test.js` adds 20).

## Feature flags

No flag VALUE was changed on this branch. R1 introduces one new server flag,
which ships OFF (every payment route answers 503 until the owner explicitly
sets it). The values below are repository defaults/source behavior, **not a
claim about uninspected live Vercel/Supabase environment values**:

| Flag | Current repository default / behavior |
|---|---|
| `ENABLE_PAYMENTS` | **new (R1)**: `false` unless exactly `true`; when not `true` every payment route answers 503 "Payments are not enabled." |
| `VITE_FEATURE_PAYMENTS` | `false` unless explicitly set to `true` (stays off until R2 lands and is merged) |
| `VITE_FEATURE_WALLET_TRANSACTIONS` | enabled unless explicitly set to `false` |
| `VITE_FEATURE_WALLET_REQUESTS` | `false` unless explicitly set to `true` |
| `VITE_FEATURE_ROOM_RPC` | `false` unless explicitly set to `true` |
| `VITE_FEATURE_TOURNAMENT_RESULTS` | enabled unless explicitly set to `false` |
| `JOIN_USE_RPC` | `false` unless exactly `true` |
| `ENABLE_WALLET_REQUESTS` | `false` unless exactly `true` |
| `ENABLE_TOURNAMENT_CANCELLATION` | `false` unless exactly `true` |
| `ENABLE_TOURNAMENT_RESULTS` | enabled unless explicitly set to `false` |

New server env vars read by R1 (values are NEVER logged or returned):
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (Basic auth to the Razorpay API),
`RAZORPAY_WEBHOOK_SECRET` (webhook HMAC). They are owner-side Vercel
environment variables; the owner checklist supplies test-mode values and
leaves the two payment flags unset until R1+R2 are merged.

## Open items and safety constraints

1. **Razorpay release continues:** R0 (`agent_docs_sync.txt` content was not
   provided to the agent — pending), R2 (wallet UI, behind
   `VITE_FEATURE_PAYMENTS`), R3 (hardening/docs/smoke test). The owner
   checklist (test keys, Vercel env vars, webhook registration) is owner-side
   and has NOT been assumed done.
2. **PRs on hold:** the user opens/merges PRs on request only.
   `feat/razorpay-server` is pushed with NO pull request yet.
3. ~~**Bigint application compatibility:** `validateTournamentId` currently
   accepts UUID-format IDs.~~ **Resolved on this branch (2026-10-17):** the
   validator, audit stringify, client `openTournament`, and all test fixtures
   are bigint-native now. Remaining UUID-shaped fixtures are intentionally
   correct: user/profile ids and wallet-request ids stay UUID
   (`api/admin.js` `RESULT_UUID_RE`, `tests/profile.test.js`,
   `tests/wallet.test.js`); `tests/playerSide.test.jsx` uses a UUID-style
   tournament fixture purely as an opaque display value with no format
   assertion; `tests/api.test.js` uses the label `'not-a-uuid'` for a
   still-invalid tournament id. No real bugs found beyond the fixed validator.
2. **SQL is not approved in this workflow:** do not write, run, or edit SQL; do
   not touch Supabase; do not edit `supabase/proposed/*.sql`.
3. Proposed **003, 005, and 006** must be rewritten for bigint before they can
   be applied. `001`, `004`, and `007` also contain direct or indirect
   UUID-era tournament assumptions and are documented as requiring review.
4. The proposed RLS, atomic join, room-credential, wallet-request,
   cancellation/refund, and audit-log migrations remain unapplied. Database
   functionality must stay behind its existing flags and fail honestly when
   missing.
5. Do not change feature-flag values without explicit user approval. Do not
   merge this branch's PR unless the user explicitly asks.
6. Keep permanent rules in `replit.md`: no secrets, no client-trusted identity
   or money values, server-side authorization, no fake payments, and truthful
   test/build reporting.

## End-of-task protocol

For every future task: update this document with completed work, verification
results, unchanged flags, and remaining risks; then run the requested checks,
commit on the task's working branch, push that branch, and stop. Do not merge
unless explicitly asked.
