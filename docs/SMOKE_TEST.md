# Smoke test — ClashArena

Manual checks that automated tests cannot cover. The unit/route tests
(`npm test`, 172 tests) run against a **mocked** Supabase, so nothing in them
proves the real database, RLS policies or flags behave as expected. This file is
that missing proof.

**Rules for running this:**
- Use a **staging Supabase project**, never the live one, and never with real
  customer data (see [DB_HANDOFF.md](DB_HANDOFF.md) §0).
- Record the actual result in the Result column. A step you did not run is
  `NOT RUN`, not `pass` (permanent rule 6).
- Two accounts are required: **A** = a normal user, **B** = an admin user
  (`profiles.role = 'admin'`).
- Where a step needs a flag, set it in Vercel *and* redeploy (env changes do not
  apply until a new deployment — see [DEPLOYMENT.md](DEPLOYMENT.md) §4).

Legend: ✅ pass · ❌ fail · ⬜ not run

---

## 0. Startup / honest degradation

| # | Step | Expected | Result |
|---|---|---|---|
| 0.1 | `npm ci && npm run lint && npm test && npm run build` | lint exits 0, 172 tests pass, build succeeds | ⬜ |
| 0.2 | Deploy with `VITE_SUPABASE_URL`/`ANON_KEY` set but the DB phase **not** applied | Site loads; no unhandled crash; screens that need missing objects show an honest message, not a spinner forever | ⬜ |
| 0.3 | Deploy with no env vars at all | Build still succeeds (CI does this); runtime shows the "not configured" state instead of a crash | ⬜ |
| 0.4 | Watch the browser console all through this run | No raw Postgres error text, no key material, no `service_role` string | ⬜ |

## 1. Signup / login (both accounts)

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Sign up as A with email + password | Account created; lands in the app signed in | ⬜ |
| 1.2 | Open the browser network tab during signup and inspect the POST to Supabase | Body has **no** `role` field (permanent rule: the client never sets its own role) | ⬜ |
| 1.3 | Sign out, sign back in as A | Works; no error toast | ⬜ |
| 1.4 | Wrong password for A | Honest "invalid credentials" message; no stack trace | ⬜ |
| 1.5 | Reload the page while signed in | Session persists | ⬜ |
| 1.6 | Sign up as B, then in the Supabase SQL editor set `profiles.role = 'admin'` for B | B reloads and can see the admin entry point | ⬜ |
| 1.7 | Sign in as A and try to reach the admin view (URL tampering / devtools) | Server rejects every admin API call with 403; a hidden button is not authorization | ⬜ |

## 2. Tournament listing

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Create a tournament (as B, see §5) with a future `match_time` | Appears in the public list | ⬜ |
| 2.2 | As A, open its detail view | Name, fee, slots, prize, rules render; no crash on a missing optional field | ⬜ |
| 2.3 | Set one tournament's `match_time` in the past (SQL) | Shows as finished/ended, does not offer a join button | ⬜ |
| 2.4 | With `VITE_FEATURE_ROOM_RPC=false` and A **not** joined | Room ID/password are not shown | ⬜ |
| 2.5 | With `VITE_FEATURE_ROOM_RPC=false` and A joined | Room columns come from the tournament row (legacy behaviour) | ⬜ |
| 2.6 | Turn `VITE_FEATURE_ROOM_RPC=true` (DB phase applied) and repeat 2.4/2.5 | Unjoined users still see nothing; joined users get credentials via `get_room_details()`; list queries no longer fetch room columns | ⬜ |

## 3. Join a tournament

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | `JOIN_USE_RPC=false` (legacy path), A joins a tournament with a free slot and enough balance | 200; registration appears; `current_players` incremented by exactly 1 | ⬜ |
| 3.2 | A joins the same tournament again | Rejected honestly ("already registered"); no second row, no second debit | ⬜ |
| 3.3 | A joins a full tournament | Rejected honestly ("full"); `current_players` unchanged | ⬜ |
| 3.4 | A joins a tournament that started | Rejected honestly; nothing changed | ⬜ |
| 3.5 | Edit the fee in the request body with devtools before sending (client-side tampering) | Server ignores it: the fee charged is the one on the **tournament row** | ⬜ |
| 3.6 | Tamper with `userId` in the request body to B's id | Server uses the token's user id; the registration/charge belongs to A only | ⬜ |
| 3.7 | A joins with a balance **below** the fee | Rejected; balance unchanged; no registration row | ⬜ |
| 3.8 | Set `JOIN_USE_RPC=true` with `003_functions_triggers.sql` applied, repeat 3.1–3.7 | Same outcomes, and now atomic (no partial debit/registration possible). Confirm `join_tournament` is not executable by `anon`/`authenticated` | ⬜ |
| 3.9 | Kill the DB mid-join (or simulate failure) on the legacy path | Compensating refund runs; record whether a debit/registration mismatch could remain (known non-atomicity) | ⬜ |

## 4. Wallet

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | `VITE_FEATURE_WALLET_TRANSACTIONS=true`, A opens the wallet | Balance + transaction history render; each amount has the right sign (join −, refund/prize +) | ⬜ |
| 4.2 | History with more than 10 transactions (`TRANSACTIONS_PER_PAGE=10`) | Pagination works; no duplicates/missing rows across pages | ⬜ |
| 4.3 | A opens the network tab and tries to read B's transactions by editing the request | Rejected — the route filters by the token's user id | ⬜ |
| 4.4 | `VITE_FEATURE_WALLET_TRANSACTIONS=false` | Wallet shows an honest "unavailable" state, not an empty list that looks like zero history | ⬜ |
| 4.5 | `ENABLE_WALLET_REQUESTS=false` (server) while `VITE_FEATURE_WALLET_REQUESTS=true` | Every wallet-request action returns **503** with the "not enabled on this server yet" message; no request row created, no balance change | ⬜ |
| 4.6 | Both flags on but `005_wallet_requests.sql` **not** applied | 503 "requires database setup"; no fake success | ⬜ |
| 4.7 | Both flags on and 005 applied — A submits a deposit request | Request appears in A's list as pending; **balance unchanged** | ⬜ |
| 4.8 | A submits a negative, zero or non-numeric amount | Rejected by validation; nothing created | ⬜ |
| 4.9 | A tries to set `status='approved'` in the request body | Ignored — the client can never set a status (rule 2) | ⬜ |
| 4.10 | A submits more than `WALLET_REQUESTS_PER_HOUR` (default 5) requests in an hour | 429 with the limit message; the (limit+1)-th is refused | ⬜ |
| 4.11 | Attempt a balance edit through Supabase's REST API with the anon key (as A) | Denied by RLS/column grants on `profiles` | ⬜ |
| 4.12 | `VITE_FEATURE_PAYMENTS` left unset/false | Add-money/withdraw buttons are disabled with an honest label; UPI ID (if shown) is **display-only** and never treated as proof of payment | ⬜ |

## 5. Admin: create / edit / cancel

| # | Step | Expected | Result |
|---|---|---|---|
| 5.1 | B opens admin → create a tournament | Created; fields validated server-side (bad fee/slots/dates rejected) | ⬜ |
| 5.2 | B edits name/fee/`match_time` | Saved; the change is visible to A on reload | ⬜ |
| 5.3 | B tries to set `current_players` directly in the edit form | Not accepted — player counts are never client-supplied | ⬜ |
| 5.4 | B views registrations for a tournament | Correct rows, correct count vs `current_players` | ⬜ |
| 5.5 | A (non-admin) calls every admin route directly with the anon key + A's token | 403 on all of them | ⬜ |
| 5.6 | B cancels a tournament with **no paid registrations** | Succeeds without `ENABLE_TOURNAMENT_CANCELLATION`; registrations handled as designed | ⬜ |
| 5.7 | B cancels a tournament with paid registrations while `ENABLE_TOURNAMENT_CANCELLATION=false` | **409** with the exact reason message; nothing changed and no refunds issued | ⬜ |
| 5.8 | Flag on but `006_cancel_tournament_refunds.sql` not applied | 503 "requires database setup" | ⬜ |
| 5.9 | Flag on, 006 applied — B cancels a tournament with paid registrations | 200; each paid registration refunded exactly once; balances match the ledger; audit entry written | ⬜ |
| 5.10 | B cancels the same tournament again (double-click / repeat) | 409 "already cancelled"; **no double refund** | ⬜ |
| 5.11 | A non-admin attempts the cancel route | 403; tournament untouched | ⬜ |
| 5.12 | Check `admin_audit_log` after 5.1, 5.2, 5.6, 5.9 | One row per admin action with actor, action, target | ⬜ |

## 6. Wallet request review (admin side)

| # | Step | Expected | Result |
|---|---|---|---|
| 6.1 | B approves A's pending deposit request (flags + 005 applied) | 200; A's balance increases by exactly the requested amount; request becomes approved; audit row written | ⬜ |
| 6.2 | B approves the same request again | 409 "already approved"; **balance unchanged** | ⬜ |
| 6.3 | B rejects a pending request | 200; request rejected; balance unchanged | ⬜ |
| 6.4 | B rejects an already-approved request | 409 ("must be approved before rejected" family); no money movement | ⬜ |
| 6.5 | B rejects/approves a non-existent request id | 404 "Request not found" | ⬜ |
| 6.6 | B approves a withdrawal larger than A's balance | 409 "insufficient balance"; balance unchanged; no negative balance anywhere | ⬜ |
| 6.7 | B approves a request for a user whose row was deleted | 404 "Profile not found" family; no partial write | ⬜ |
| 6.8 | A (non-admin) calls approve/reject | 403 | ⬜ |

## 7. Flags on/off — the whole matrix

Each row: change the flag(s), redeploy, then confirm the behaviour. Any row where
a flag is ON but its DB object is missing must produce an **honest 503**, never a
fake success.

| # | Flags | Prerequisite | Expected | Result |
|---|---|---|---|---|
| 7.1 | all flags off (defaults) | none | App fully usable for auth/listing/join(legacy)/admin basics; wallet requests + cancel-with-refunds + room-RPC paths off with honest messages | ⬜ |
| 7.2 | `JOIN_USE_RPC=true` | 003 §2 applied | Join goes through `join_tournament`; results identical to §3 | ⬜ |
| 7.3 | `JOIN_USE_RPC=true` | **not** applied | Honest failure, no partial state (verify which status/message is returned and record it) | ⬜ |
| 7.4 | `VITE_FEATURE_ROOM_RPC=true` | 003 §3 applied | Room credentials only via the RPC, only for joined players | ⬜ |
| 7.5 | `VITE_FEATURE_WALLET_REQUESTS=true` + `ENABLE_WALLET_REQUESTS=true` | 005 applied | Request flow works end to end (§4, §6) | ⬜ |
| 7.6 | Server flag `true`, client flag `false` | 005 applied | The UI hides the form; direct API calls still work but nothing is exposed in the UI — confirm and decide whether that is intended | ⬜ |
| 7.7 | Server flag `false`, client flag `true` | any | 503 on every wallet action (this is the kill switch) | ⬜ |
| 7.8 | `ENABLE_TOURNAMENT_CANCELLATION=true` | 006 applied | Cancellation with refunds works exactly once (§5.9–5.10) | ⬜ |
| 7.9 | `ENABLE_TOURNAMENT_CANCELLATION=false` | any | 409 with the reason; no change | ⬜ |
| 7.10 | After every flag flip | — | Confirm the other features did not regress (re-run §1.1, §2.2, §3.1, §5.1) | ⬜ |

## 8. Cross-cutting

| # | Step | Expected | Result |
|---|---|---|---|
| 8.1 | Open the app at 360 px, 768 px and desktop widths (real browser/devtools) | No horizontal scroll, no clipped controls, no overlapping text | ⬜ |
| 8.2 | Tab through login, join, wallet and admin forms | Every control is reachable and announced (labels present); focus visible | ⬜ |
| 8.3 | Zoom the page to 200 % | Content still usable — **note:** the viewport meta currently sets `maximum-scale=1.0, user-scalable=no`, which blocks pinch-zoom on mobile. Record whether the owner accepts this | ⬜ |
| 8.4 | Run Lighthouse on the deployed staging URL (`npx lighthouse <url> --only-categories=performance,accessibility --view`) | Record the real scores. Not run in CI; not run in the coding sandbox (no browser binary) | ⬜ |
| 8.5 | Log in as A on two devices/browsers; approve a wallet request from B while A is on the wallet screen | No stale/false balance; the UI refreshes to the truth on reload | ⬜ |
| 8.6 | Search the deployed bundle for secrets: `grep -rl "SERVICE_ROLE\|service_role" dist/` | No matches (same check as [DEPLOYMENT.md](DEPLOYMENT.md) §5) | ⬜ |
| 8.7 | Trigger a 500 on purpose (e.g. wrong DB URL) | Client sees a generic message; no SQL/schema text leaks | ⬜ |

---

### Sign-off

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Environment (staging URL) | |
| Build / commit | |
| Flags set | |
| Steps passed | |
| Steps failed (with numbers) | |
| Steps not run (with numbers) | |

Anything ❌ or ⬜ here means the product is **not** ready to be called
production-ready. Known, accepted gaps are listed at the end of
[docs/AUDIT.md](AUDIT.md).
