# ClashArena — Project State

**Last updated:** 2026-10-16 (Asia/Kolkata)

**Working branch:** `arena/b00f9890-clasharena`

**Pull request:** [#9](https://github.com/agam63818-wq/clasharena/pull/9) is open and must **not** be merged unless the user explicitly requests it.

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

### Completed on this branch

- Signup/profile completion, admin tournament management, player match details,
  phone-required joining, and admin tournament-results management are in the
  open PR (through commit `203608b`).
- `api/profile.js` now checks a duplicate mobile number with `.limit(1)` and the
  first returned row rather than `.maybeSingle()`. Legacy data containing two
  other owners of the same number returns the safe `409` / `PHONE_IN_USE`
  response instead of a multiple-row database error.
- `DateTimeAmPm` in `src/pages/AdminView.jsx` now keeps local hour, minute, and
  AM/PM selections while no date exists; an ISO timestamp is emitted only after
  a date is selected. Existing saved times still hydrate the controls.
- Tests cover the duplicate legacy phone-owner response, a no-date time draft,
  and saved-time hydration.
- `replit.md` now starts with the mandatory session protocol.
- `docs/DB_REQUIREMENTS.md` now records the deployed bigint/result-RPC contract
  and marks UUID-era proposed migrations as rewrite-gated. No SQL was edited or
  executed.

### Verification status for the current follow-up

- `npm run lint` — passed (exit 0).
- `npm run build` — passed with Vite 5.4.21; 2,182 modules transformed.
- `npm test` — passed: **9 test files, 225 tests**.
- Focused follow-up tests also passed: `tests/profile.test.js` and
  `tests/adminView.test.js` (13 tests total).
- `git diff --check` — passed (no whitespace errors).
- The full test suite deliberately logs mocked database failure paths to stderr;
  its process exit was 0 and all tests passed.

## Feature flags — unchanged

No feature-flag value was changed in this follow-up. The values below are
repository defaults/source behavior, **not a claim about uninspected live
Vercel/Supabase environment values**:

| Flag | Current repository default / behavior |
|---|---|
| `VITE_FEATURE_PAYMENTS` | `false` unless explicitly set to `true` |
| `VITE_FEATURE_WALLET_TRANSACTIONS` | enabled unless explicitly set to `false` |
| `VITE_FEATURE_WALLET_REQUESTS` | `false` unless explicitly set to `true` |
| `VITE_FEATURE_ROOM_RPC` | `false` unless explicitly set to `true` |
| `VITE_FEATURE_TOURNAMENT_RESULTS` | enabled unless explicitly set to `false` |
| `JOIN_USE_RPC` | `false` unless exactly `true` |
| `ENABLE_WALLET_REQUESTS` | `false` unless exactly `true` |
| `ENABLE_TOURNAMENT_CANCELLATION` | `false` unless exactly `true` |
| `ENABLE_TOURNAMENT_RESULTS` | enabled unless explicitly set to `false` |

## Open items and safety constraints

1. **Bigint application compatibility:** `validateTournamentId` currently
   accepts UUID-format IDs. This is incompatible with the deployed bigint
   tournament contract and needs a separately scoped, end-to-end application
   change (client, APIs, tests, and RPC callers). It was documented here, not
   changed in this follow-up.
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
   merge PR #9, create a new branch, or open a new PR for this work.
6. Keep permanent rules in `replit.md`: no secrets, no client-trusted identity
   or money values, server-side authorization, no fake payments, and truthful
   test/build reporting.

## End-of-task protocol

For every future task: update this document with completed work, verification
results, unchanged flags, and remaining risks; then run the requested checks,
commit on `arena/b00f9890-clasharena`, push that branch, and stop. Do not merge
unless explicitly asked.
