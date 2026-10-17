# ClashArena — Project State

**Last updated:** 2026-10-17 (Asia/Kolkata)

**Working branch:** `fix/bigint-tournament-ids` — a new branch cut from the
latest `main` (`a5675ef`), created per the user's explicit instruction for this
task. The working tree of the previous local checkout (`feat/my-matches-join-ux`)
was left untouched; this branch lives in a separate worktree.

**Pull request:** PR #9 was merged into `main` (`a5675ef`). A new PR from
`fix/bigint-tournament-ids` carries the bigint tournament-ID fix below and must
**not** be merged unless the user explicitly requests it.

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

### Completed on this branch (2026-10-17)

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

### Verification status for this task (real runs, 2026-10-17)

- `npm run lint` — passed (exit 0, eslint reported nothing).
- `npm run build` — passed with Vite 5.4.21; 2,182 modules transformed.
- `npm test` — passed: **10 test files, 245 tests** (was 225 before this
  branch; `tests/tournamentId.test.js` adds 20).
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

1. ~~**Bigint application compatibility:** `validateTournamentId` currently
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
