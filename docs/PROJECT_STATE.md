# ClashArena - Project State (READ THIS FIRST in every new session)

Last verified: 2026-10-18 (PR #10 merged, atomic join enabled, payments tables created, Razorpay R1 server + R2 wallet UI written; payments flags still OFF). The coding agent MUST update this file at
the end of every task (what changed, flag values, open items) and commit it on the same branch.

## How we work
- Read `replit.md` (PERMANENT RULES), this file and `docs/DB_REQUIREMENTS.md` before doing anything.
  Then write a 10-line summary of what you understood and WAIT for the task.
- One part per branch, always created from the latest `main` (or the Arena-assigned branch). Do not merge. Push,
  report real lint/build/test output, STOP.
- The coding agent never writes or runs SQL and never touches Supabase. Database changes are made separately
  (by Claude, through the Supabase connector) and listed here.
- Never claim a test/build passed unless it was actually run. Never print or commit secrets.

## Stack and links
- React + Vite frontend, Vercel serverless routes in `api/*`, Supabase (project `abnhblqclhbnzypswhot`).
- Repo `agam63818-wq/clasharena`, Vercel project `clasharena`. Production is deployed from `main` (URL `clasharena-nine.vercel.app`).
- Vercel PREVIEW deployments use the PRODUCTION Supabase. Never test with real users' money or data.

## Live database (verified 2026-10-16)
Tables: `profiles`, `tournaments`, `match_registrations`, `transactions`, `tournament_results`, `admin_audit_log`,
`payments`, `payment_webhook_events`
(+ schema `backup_20261014` = in-database snapshot taken before hardening; can be dropped once everything is trusted).
- `tournaments.id` and `match_registrations.id` are bigint (NOT uuid). `tournaments.prize` is numeric(12,2).
  `profiles.balance` is integer (whole rupees). `transactions.id` is uuid, `transactions.amount` is numeric (rupees).
  `transactions.type` in (join, deposit, withdraw, refund, prize); `transactions.status` in (pending, completed, failed, reversed);
  `transactions.reference` (text, nullable) links a deposit to its Razorpay payment id (unique for deposits).
  NOTE: `transactions.user_id` is ON DELETE CASCADE to profiles; nobody can delete profiles from the browser, but never delete
  a profile by hand without exporting its ledger.
- `tournaments.status` allows: registration, upcoming, live, completed, cancelled.
- Browser (anon / authenticated) can: read tournaments EXCEPT `room_id` and `room_password` (column-level SELECT grant),
  read its OWN profile / registrations / transactions, and UPDATE only `profiles.ff_id`, `profiles.nickname`,
  `profiles.avatar_url`. It cannot insert/delete profiles and cannot write tournaments, match_registrations,
  transactions. A browser query with `select('*')` on tournaments now FAILS (permission denied) - always list columns.
  If a new column is added to `tournaments` it needs an explicit `GRANT SELECT (col) ... TO anon, authenticated`.
  Every other write goes through `api/*` with the service role after token verification.
- Room credentials: players get them ONLY through `get_room_details(bigint)`; admins read/edit them through
  `api/admin.js` (service role).
- Triggers: `handle_new_user` (creates the profile at signup from signUp `options.data` username/phone; invalid or
  duplicate values fall back safely), `block_balance_update` (non-service roles cannot change balance, role, is_admin,
  level, wins, total_played), `trg_player_count_insert/delete` -> `update_player_count` (recomputes current_players).
- Functions (all SECURITY DEFINER with a fixed search_path):
  - `get_room_details(p_tournament_id bigint)` -> table(room_id, room_password); authenticated; registered players or admins.
  - `admin_set_tournament_results(p_tournament_id bigint, p_admin_id uuid, p_results jsonb) -> jsonb {success, error}`;
    service_role only; validates everything first, replaces results atomically, marks the tournament completed.
  - `join_tournament(p_user_id uuid, p_tournament_id bigint, p_ff_uid text, p_ign text) -> json`; service_role only;
    atomic (tournament row lock + profile row lock; capacity, duplicate, balance, registration, balance deduction and a
    ledger row `type='join'`). Returns {success:true} or {error[, code:'23505']} with the messages api/joinTournament.js maps.
    DB-tested with rolled-back transactions. ENABLED in production (JOIN_USE_RPC=true).
  - `credit_payment(p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint, p_currency text,
    p_event_id text default null) -> json {success, credited?, duplicate?, amount_rupees?, error?}`; service_role only.
    The ONLY way a payment becomes wallet balance. Atomic + idempotent: looks up the `payments` row by order id (row lock),
    returns {success:true, duplicate:true} if already credited, rejects with error 'Unknown order' / 'Currency mismatch' /
    'Amount mismatch' / 'Payment already used' / 'Missing data' (nothing is credited in those cases), otherwise adds a
    deposit ledger row (reference = payment id), increases profiles.balance and marks the payment `credited`.
    p_event_id = Razorpay's event id header (webhook) or 'verify:<payment_id>' (client confirmation route).
    DB-tested end to end in rolled-back transactions (wrong amount/currency, duplicates, same payment on two orders, join with the credited balance).
- `tournament_results`: public SELECT only when the tournament is `completed`. No client writes.
- `payments` (one row per Razorpay order; amounts in PAISE, whole-rupee amounts only, INR only, 100..10,000,000 paise;
  status created|failed|credited; unique provider_order_id and provider_payment_id): the owner can SELECT own rows;
  every write is service-role only. `payment_webhook_events`: server only (event-id idempotency log).
- `admin_audit_log`: service role only (RLS on, no policies); `target_id` is TEXT. Writes from `api/_lib/audit.js` are best effort.
- Constraints: non-negative entry_fee / prize / balance, max_players >= 1, role in (user, admin), unique
  (tournament_id, user_id) registrations. NEW accounts (created from 2026-10-14) must have a unique phone and a
  case-insensitively unique username. Older accounts were left untouched (two old accounts share a phone).
- Migrations applied by Claude: clasharena_phase_a_00 .. _10 (snapshot, privilege lockdown, constraints/status,
  signup trigger + room RPC, prize to numeric, results table, unique indexes for new accounts, results RPC contract +
  audit log, room credential lockdown, atomic join, payments/credit_payment).

## NOT created in the database (do not call these)
- `wallet_requests` table, wallet approve/reject RPCs, `cancel_tournament_with_refund`. The files in
  `supabase/proposed/` (003, 005, 006) were written for uuid ids and must be REWRITTEN for bigint before they can be applied.
- Therefore these flags must stay OFF / unset: `ENABLE_WALLET_REQUESTS`, `VITE_FEATURE_WALLET_REQUESTS`,
  `ENABLE_TOURNAMENT_CANCELLATION`. Cancelling a tournament that has PAID registrations stays blocked.
- Withdrawals / prize payouts / refunds to the wallet have no DB function yet (out of scope for the first Razorpay release).

## Flags (Vercel)
- `VITE_FEATURE_ROOM_RPC` = true (production, preview, development) - room credentials only via the RPC.
- `JOIN_USE_RPC` = true (production, preview): joins use the atomic `join_tournament` function. The legacy path stays in
  the code as a fallback only (delete the variable + redeploy to revert).
- Payments: `VITE_FEATURE_PAYMENTS` and `ENABLE_PAYMENTS` are NOT set (payments are OFF). Razorpay env vars
  (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) are added by the OWNER in Vercel; never put secrets in code or chat.
- Do not change flag values without an explicit instruction from the owner.

## Feature status
- Done: tournament ids are bigint everywhere in the API/tests (PR #10), token-verified API routes, server-side admin router, signup with phone, phone required to join, prefilled
  join form, My Matches -> match details, room credentials via RPC, admin edit/delete/cancel (no paid refunds), Completed
  status, AM/PM time picker, admin sees player username/IGN/UID/phone, results (admin + player).
- Razorpay R1 (server, branch feat/razorpay-server): `api/payments.js` (POST router: createOrder / verify / listPayments;
  identity from the token, paise and ids from Razorpay's own responses, HMAC check with timingSafeEqual, then
  `credit_payment`) and `api/razorpayWebhook.js` (raw-body HMAC with RAZORPAY_WEBHOOK_SECRET, bodyParser disabled; handles
  payment.captured -> credit_payment and payment.failed -> payments.status 'failed' only if still 'created'; rejected credits
  answer 200 and log ids only). 41 tests in tests/payments.test.js. Both answer 503 unless `ENABLE_PAYMENTS` is exactly 'true'.
  Not verified in a real runtime yet: raw-body access on Vercel and the webhook signature with a real Razorpay test event.
- Razorpay R2 (client, branch arena/27bdeaa7-clasharena): Wallet 'Add money' UI in `src/App.jsx` WalletView +
  `createPaymentOrder`/`verifyPayment`/`listPayments` in `src/lib/apiClient.js`, all behind `features.payments`
  (`VITE_FEATURE_PAYMENTS`, still unset/OFF — with the flag off the wallet keeps today's honest "coming soon" state).
  Flow: createOrder -> load checkout.js on demand (once) -> Razorpay Checkout -> server verify; success is shown
  ONLY on verify 'credited'/'already_credited' or a polled Payments-list credit after a 'pending' verify (poll:
  4 x 2s, new-credited-row detection vs a pre-top-up snapshot). Amount chips 50/100/200/500 + custom whole-rupee
  amount (10-5000, server limits), ref+disabled double-tap guard, dismissed/script/network/verify-error honest
  states, visible 'TEST MODE - no real money' banner once an order returns an rzp_test_ key id (the browser only
  learns the key id from createOrder), a Payments history list (amount/status/date), deposits render '+' via the
  existing `txSign` type map. The browser never writes balances or payments. 33 new tests
  (tests/walletPayments.test.jsx 27, tests/walletPaymentsOff.test.jsx 2, apiClient +4); full suite 319 passing,
  lint clean, build OK. No Razorpay npm package. Not verified against a real Razorpay test checkout yet.
- All entries are free and all wallet balances are 0 so far. No payment gateway is live (payments flags are OFF).

## Open items (in priority order)
1. Razorpay wallet top-up, TEST MODE first: R1 server + R2 wallet UI are written (see Feature status); next R3 =
   hardening/docs, then the OWNER sets test keys + registers the webhook in Vercel/Razorpay, enables
   `ENABLE_PAYMENTS`/`VITE_FEATURE_PAYMENTS`, and runs the test-mode smoke test. Live mode only after the owner confirms Razorpay
   approval and a legal check. The Razorpay account is SHARED with another website the owner runs: the account-level webhook
   will also deliver that site's payments (they hit 'Unknown order' here, which is harmless and only logged), and this site's
   payments will reach that site's webhook (the owner must check that it ignores unknown orders).
2. Add a real concurrency test for `join_tournament` before paid entries go live.
3. Wallet requests / refunds-on-cancel / payouts: DB objects must be rewritten for bigint first.
4. Owner tasks: enable leaked-password protection in Supabase Auth, review the 3 admin accounts, mark
   `SUPABASE_SERVICE_ROLE_KEY` as Sensitive in Vercel.
5. Known limitation: phone numbers are not OTP-verified.
6. Supabase advisor notes that are intentional: RLS-without-policy on the backup tables and admin_audit_log;
   get_room_details executable by authenticated (it checks registration/admin inside).

## Decisions
- Existing accounts and data are not edited; new rules apply to everyone the next time they log in or join.
- Phone numbers are visible to admins only, through the admin API. Players never see another player's phone.
- Prize amounts in results are records; wallet payouts stay manual until payments are built.
