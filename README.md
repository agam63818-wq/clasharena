# ClashArena

A Free Fire tournament web app: React 18 + Vite frontend, a handful of Vercel
serverless API routes, and Supabase (Postgres + Auth) as the datastore.

> **Status: not production-ready.** The database phase has **not** been applied —
> every migration in `supabase/proposed/` is proposed SQL that has never been run
> (see [docs/DB_HANDOFF.md](docs/DB_HANDOFF.md)). Wallet money movement,
> atomic joins and tournament cancellation are implemented in code but depend on
> those database objects and are switched off by default. There is no payment
> gateway. Read [Honest limits](#honest-limits) before deploying.

---

## 1. What works today (no database changes needed)

| Feature | State |
|---|---|
| Email/password signup + login (Supabase Auth) | Works. The profile row insert is a direct anon-key write — see the RLS dependency in [docs/DB_REQUIREMENTS.md](docs/DB_REQUIREMENTS.md) §2.1 |
| Tournament listing / detail / My Matches | Works (authenticated reads) |
| Join a tournament (legacy path) | Works: server-verified identity, fee read from the `tournaments` row, duplicate/capacity/status guards. **Not atomic** — see the flag table for `JOIN_USE_RPC` |
| Admin: create / edit / list registrations / cancel | Works through one server router with a server-side admin check |
| Admin: approve / reject wallet requests | Behind flags + proposed SQL; degrades to an honest "requires database setup" message |
| Wallet history | Works (user-filtered); pagination added |
| Wallet deposit/withdraw requests | Behind flags + proposed SQL |
| Room ID / password reveal | Works from the tournament row; the safer RPC path is behind `VITE_FEATURE_ROOM_RPC` + proposed SQL |
| Payments | **Not implemented** and deliberately switched off — no gateway, no fake buttons |

## 2. Prerequisites

- Node **>= 20** (see `.nvmrc`; `engines` in `package.json` enforces it)
- npm 10+
- A Supabase project — optional for local UI work: without env vars the app
  builds and runs, but data-dependent screens show honest error states.

## 3. Setup

```bash
git clone <repo> && cd clasharena
npm ci                     # install exactly what package-lock.json pins
cp .env.example .env       # then fill in the two VITE_ values (see §5)
npm run dev                # http://localhost:5173
```

`npm run dev` starts Vite on port 5173 (strictPort, host 0.0.0.0). API routes
(`api/*`) are **not** served by Vite — for a full local stack with `/api/*`, use
`vercel dev` (Vercel CLI) instead, or test the routes through `npm test` (they
are covered by mocked unit tests).

## 4. Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | ESLint 9 flat config: real bugs + a11y errors (see `eslint.config.js` for the two deliberate rule exclusions) |
| `npm test` | Vitest: 172 tests, Supabase fully mocked, no network, no secrets |
| `npm run test:watch` | Vitest in watch mode |

CI (`.github/workflows/ci.yml`) runs install → lint → build → test on every push
and pull request with **no secrets configured**.

## 5. Environment variables (names only)

**Client (`VITE_*`) — these are bundled into the public JavaScript. Never put a
secret here.**

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (publishable) key |
| `VITE_FEATURE_PAYMENTS` | Payments flag (default off) |
| `VITE_FEATURE_WALLET_TRANSACTIONS` | Wallet history flag |
| `VITE_FEATURE_WALLET_REQUESTS` | Deposit/withdraw request UI |
| `VITE_FEATURE_ROOM_RPC` | Room credentials via RPC |
| `VITE_SUPPORT_WHATSAPP` | Support contact, display only |
| `VITE_SUPPORT_UPI` | Support contact, **display only** |

**Server-only (Vercel env vars, never `VITE_`-prefixed)**

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — bypasses RLS. Server only |
| `JOIN_USE_RPC` | Use the atomic join function |
| `ENABLE_WALLET_REQUESTS` | Wallet-request kill switch |
| `WALLET_REQUESTS_PER_HOUR` | Per-user hourly cap (default 5) |
| `ENABLE_TOURNAMENT_CANCELLATION` | Cancellation-with-refunds switch |

## 6. Feature flags (permanent rule 7)

One table for every flag — **do not invent new flag names**. A flag is switched
on only once the database object (or provider) it needs demonstrably exists;
otherwise the feature degrades gracefully with an honest message.

| Flag | Read by | What it turns on | Required DB object / provider | Safe default |
|---|---|---|---|---|
| `VITE_FEATURE_PAYMENTS` | client — `features.payments` | Real add-money / withdraw flow | A payment provider **and** a server-side transaction write path — neither exists (docs/AUDIT.md P1-6) | **`false`** — wallet buttons stay disabled |
| `VITE_FEATURE_WALLET_TRANSACTIONS` | client — `features.walletTransactions` | Wallet transaction history | Existing `transactions` table + RLS `user_id = auth.uid()` | **`true`** |
| `VITE_FEATURE_WALLET_REQUESTS` | client — `features.walletRequests` | Deposit/withdraw request form + request list | `wallet_requests` (RLS: own rows, insert/select only) + `approve_wallet_request`/`reject_wallet_request` — `005_wallet_requests.sql`. **Not applied.** Also needs the server flag below | **`false`** |
| `ENABLE_WALLET_REQUESTS` | server — `api/wallet.js`, `api/admin.js` | Kill switch for the whole wallet-request flow | Same objects as above. While off, every wallet action answers 503 and **no money can move** | **`false`** |
| `JOIN_USE_RPC` | server — `api/joinTournament.js` | Atomic join via `join_tournament(p_user_id, …)` (EXECUTE to `service_role` only) | `003_functions_triggers.sql` §2. **Not applied.** | **`false`** — non-atomic legacy path |
| `VITE_FEATURE_ROOM_RPC` | client — `features.roomDetailsRpc` | Room ID/password via `get_room_details()` (`auth.uid()`-based, `authenticated`) | `003_functions_triggers.sql` §3, optionally `004_room_credentials_split.sql`. **Not applied.** | **`false`** |
| `ENABLE_TOURNAMENT_CANCELLATION` | server — `api/admin.js` (`cancelTournament`) | Cancelling a tournament that has **paid** registrations, with refunds | `cancel_tournament_with_refund()` — atomic, idempotent, `service_role` only (`006_cancel_tournament_refunds.sql`). **Not applied.** A tournament with no paid registrations cancels without this flag | **`false`** — 409 with the exact reason |

## 7. Architecture

```
index.html
src/
  main.jsx                 React root
  App.jsx                  All player-facing views (home, detail/join, wallet, profile, my matches)
  App.css                  Single stylesheet (CSS custom properties, dark esports theme)
  config/features.js       Client feature flags (single source of truth)
  config/support.js        Public support contact (VITE_SUPPORT_*)
  lib/supabaseClient.js    Browser Supabase client (anon key — public by design)
  lib/apiClient.js         Every call to /api/*: attaches the session token, normalizes errors
  lib/transactions.js      Interim wallet sign convention + pagination helpers
  lib/format.js            Date/currency/number display formatting
  lib/tournamentStatus.js  Display-status derivation
  components/              Avatar, Modal, EmptyState, ErrorRetry, Skeletons, StatusBadge, TournamentCard
  pages/AdminView.jsx      Lazy-loaded admin dashboard (create/edit/cancel, registrations, wallet queue)
  pages/Terms.jsx          Placeholder policy text — needs owner/legal review
api/                       Vercel serverless functions (4 = well under Hobby's 12 limit)
  _lib/auth.js             requireUser / requireAdmin (identity from the Bearer token, role from the DB)
  _lib/errors.js           HttpError + single safe error responder (no raw DB errors to clients)
  _lib/supabaseAdmin.js    Lazy service-role client (503 instead of a crash when env is missing)
  _lib/validate.js         Tournament/user input validation
  _lib/dbErrors.js         "Object not created yet" detection → honest 503
  _lib/audit.js            Best-effort admin audit log writer
  joinTournament.js        Join (RPC path or legacy path)
  wallet.js                User-side wallet request router
  admin.js                 Admin router: tournaments, registrations, wallet review, cancel
  deleteTournament.js      Hard delete (kept; the UI now cancels instead)
supabase/proposed/         Proposed SQL, NOT APPLIED: 001..007
tests/                     Vitest suites (API routes, wallet, admin, client helpers) — Supabase mocked
docs/                      AUDIT, DB_REQUIREMENTS, DB_HANDOFF, DEPLOYMENT, SMOKE_TEST
```

Trust boundaries (short version): the browser never decides identity, role,
balance, entry fee, status or player counts. Tokens are verified server-side
(`api/_lib/auth.js`), roles are read from the database, money only moves inside
`SECURITY DEFINER` functions granted to `service_role`, and every admin action is
recorded best-effort in `admin_audit_log`. Full detail:
[docs/AUDIT.md](docs/AUDIT.md) and [docs/DB_REQUIREMENTS.md](docs/DB_REQUIREMENTS.md).

## 8. Testing

```bash
npm test          # 172 tests, ~1.7s, no network/DB needed
npm run lint      # must exit 0
npm run build     # must succeed
```

Manual checks that no test can cover live in [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md).

## 9. Quality checks (measured, not estimated)

Production build on this repository (`npm run build`, Vite 5.4):

| Artifact | Raw | Gzipped |
|---|---|---|
| `index-*.js` (app) | 251,513 B | 65,384 B |
| `vendor-motion-*.js` | 134,803 B | 44,197 B |
| `vendor-react-*.js` | 133,935 B | 42,951 B |
| `AdminView-*.js` (lazy, admins only) | 23,439 B | 6,207 B |
| `index-*.css` | 22,352 B | 4,708 B |
| `favicon.svg` + `index.html` | 2,370 B | 1,271 B |
| **Total `dist/` (7 files)** | **568,412 B (568.4 KB)** | **164,718 B (164.7 KB)** |

Measured on this repository's real build output (`find dist -type f -printf`,
`gzip -9 -c` per file), not estimated.

Accessibility: `eslint-plugin-jsx-a11y` (rules listed in `eslint.config.js`) is
clean — **0 errors, 0 warnings**. Contrast is measured, not linted, and three
WCAG AA failures were found and **fixed on 2026-10-13** (details and exact ratios
in [docs/AUDIT.md](docs/AUDIT.md) → *Round 3*): `--text-muted` 4.38 → 5.37 on
`--bg-surface`, the primary button's white label 3.33/2.86 → 5.81/6.76 with a
near-black label, and the zoom-blocking `user-scalable=no` removed from the
viewport meta. One residual is known and **not** fixed: `.badge--cancelled`
reaches only 4.42 because its own translucent background lightens the surface
under the muted text; white-on-red "live" badges (3.76) and `.skip-link` (3.33)
are also below 4.5 and await an owner decision.

Lighthouse was **not** run here (no browser binary in the build environment, and
the Chrome download is blocked); run it locally with:

```bash
npx lighthouse http://localhost:5173 --only-categories=performance,accessibility --view
```

## 10. Deploying to Vercel

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — it lists the exact environment
variables, which are server-only, and how to prove the service-role key is not
in the shipped bundle.

## Honest limits

- The database phase is **not applied**: RLS, constraints, the atomic join
  function, room-credential protection and the wallet/cancel RPCs are proposed
  SQL only.
- Joins on the legacy path are **not atomic** (documented; mitigated by an
  optimistic lock + compensating refund, not eliminated).
- There is **no payment gateway**; wallet requests are a manual,
  admin-approved ledger. The UPI ID shown in the UI is display-only and is never
  used to verify payments.
- `src/pages/Terms.jsx` is placeholder policy text that needs owner/legal review
  and contains at least one claim (payments) the app does not fulfil.
- Test coverage is unit/route-level with a mocked Supabase. There are no
  end-to-end tests against a real project.
