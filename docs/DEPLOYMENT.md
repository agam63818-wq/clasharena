# Deployment — ClashArena on Vercel

How to deploy, which environment variables exist, which of them are **server
only**, and how to prove the service-role key never reaches the browser.

> Deploy in this order for a first-time setup: Vercel project (this file) →
> database runbook ([DB_HANDOFF.md](DB_HANDOFF.md)) → smoke test
> ([SMOKE_TEST.md](SMOKE_TEST.md)). Deploying with flags off is safe; flipping a
> flag before its database object exists is not.

---

## 1. What Vercel needs to know

The repository needs **no custom build configuration** — Vercel detects Vite and
the `api/` directory automatically:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | **20.x** (from `.nvmrc` / `engines.node >= 20`) |
| Serverless functions | `api/*.js` — **4** of them: `joinTournament`, `wallet`, `admin`, `deleteTournament` |

Why the function count matters: the Hobby plan allows **12 serverless functions
per deployment**. The four routes above are deliberately routers (one file each,
with `api/_lib/*` as plain shared modules, not functions) so the app stays well
under the limit. **Do not add a fifth endpoint file per feature** — add a case to
`api/admin.js` or `api/wallet.js` instead.

`vercel.json` only holds rewrites: `/api/*` passes through to the functions and
everything else falls back to `/index.html` so client-side routing works.

## 2. Server-only environment variables

Set these under **Project → Settings → Environment Variables**. They are read by
`process.env` inside `api/*` at request time and are **never** prefixed with
`VITE_`. Vercel only exposes `VITE_`-prefixed variables to the build/browser, so
the `VITE_` prefix is the boundary — putting a secret behind it would ship it to
every visitor.

| Variable | Required? | Purpose |
|---|---|---|
| `SUPABASE_URL` | Required for any API route | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for any API route | **Server only.** Bypasses RLS. Used exclusively by `api/_lib/supabaseAdmin.js` to verify tokens, read roles and call the `service_role`-granted RPCs |
| `JOIN_USE_RPC` | Optional, default `false` | Routes joins through `join_tournament()` (atomic) |
| `ENABLE_WALLET_REQUESTS` | Optional, default `false` | Kill switch for the whole wallet-request flow |
| `WALLET_REQUESTS_PER_HOUR` | Optional, default `5` | Per-user hourly cap on wallet requests (enforced with a DB count, not memory) |
| `ENABLE_TOURNAMENT_CANCELLATION` | Optional, default `false` | Enables cancelling tournaments that have paid registrations, with refunds |

Rules that apply to all of them:

- **Never** rename one to `VITE_SUPABASE_SERVICE_ROLE_KEY`. It would be inlined
  into the public bundle and the database would be effectively public.
- **Never** put the service-role key in `src/**`, in `docs/`, in a commit, or in
  a log line. The tests run with these variables unset and a mocked client, which
  is deliberate — CI needs no secrets.
- If `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are missing at runtime, the API
  answers a controlled **503** ("server is not configured") instead of crashing
  (`api/_lib/supabaseAdmin.js` is lazy for this reason).
- The service-role key must be rotated if it is ever pasted into a screenshot,
  a chat, a ticket or a client-side file.

## 3. Client variables (public by definition)

Read in `src/config/features.js` and `src/config/support.js` via
`import.meta.env`. **Everything here is compiled into the JavaScript that every
visitor downloads** — treat each value as public.

| Variable | Default | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | — | Project URL |
| `VITE_SUPABASE_ANON_KEY` | — | Anon/publishable key. Safe in the browser **only while RLS is correct**; it can read/write anything RLS allows the `anon`/`authenticated` roles |
| `VITE_FEATURE_PAYMENTS` | `false` | Must stay `false` — there is no payment gateway |
| `VITE_FEATURE_WALLET_TRANSACTIONS` | `true` | Wallet history (existing `transactions` table) |
| `VITE_FEATURE_WALLET_REQUESTS` | `false` | Request UI; also needs the server flag |
| `VITE_FEATURE_ROOM_RPC` | `false` | Room credentials via `get_room_details()` |
| `VITE_SUPPORT_WHATSAPP` | unset | Display-only contact |
| `VITE_SUPPORT_UPI` | unset | **Display-only.** This UPI ID is never used to verify a payment |

The authoritative flag table (what each flag needs in the database and its safe
default) lives in [README.md](../README.md#6-feature-flags-permanent-rule-7).
Do not invent flag names.

### The "on" order, when you do deploy the DB phase

Flip one, redeploy, smoke test, then continue (details in
[DB_HANDOFF.md](DB_HANDOFF.md) §6):

1. `JOIN_USE_RPC=true`
2. `VITE_FEATURE_ROOM_RPC=true`
3. `ENABLE_WALLET_REQUESTS=true` + `VITE_FEATURE_WALLET_REQUESTS=true`
4. `ENABLE_TOURNAMENT_CANCELLATION=true`

## 4. Environment changes need a new deployment

Vercel bakes `VITE_*` values at **build** time and freezes `process.env` for a
deployment at **deploy** time. Changing a variable in the dashboard does not
affect anything already running. After any environment change:

```bash
vercel --prod          # or push a commit / "Redeploy" in the dashboard
```

To avoid surprises, set variables **before** the first deploy, or redeploy
immediately after each change — and remember that `VITE_*` changes require a
full rebuild, not just a restart.

## 5. Verify the service-role key is NOT in the bundle

This is the check that must pass before every production deploy. It inspects the
artifacts Vercel actually uploads to the browser.

```bash
# 1. Build locally, exactly as Vercel does
npm ci
npm run build

# 2. Search every shipped file for the secret's key names and shape.
#    Expected: NO output, exit status 1.
cd dist && grep -rn "SERVICE_ROLE\|service_role\|serviceRoleKey\|supabaseAdmin" . ; echo "exit=$?"
cd ..

# 3. Show which VITE_ names are readable in the shipped JS.
grep -rho "VITE_[A-Z_]*" dist/ | sort -u
```

Verified behaviour of these commands on this repository (both with no env and
with dummy `VITE_*` values set):

- Step 2: **no output, exit status 1** for `SERVICE_ROLE`, `service_role`,
  `serviceRoleKey`, `supabaseAdmin` — 0 occurrences in every shipped chunk. That
  is the pass condition. Any hit means a secret name or secret code path leaked
  into client code — stop and fix before deploying.
- Step 3 prints exactly five names:
  `VITE_FEATURE_ROOM_RPC`, `VITE_FEATURE_WALLET_REQUESTS`,
  `VITE_FEATURE_WALLET_TRANSACTIONS`, `VITE_SUPPORT_UPI`,
  `VITE_SUPPORT_WHATSAPP`.

Two subtleties worth knowing:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` do **not** appear in step 3:
  Vite replaces `import.meta.env.VITE_SUPABASE_URL` with the literal **value** at
  build time, so the *name* disappears and the *value* is inlined. Confirm that
  is the only thing you see:

  ```bash
  grep -rn "supabase.co" dist/        # the project URL: expected (public)
  ```

  The anon key is likewise inlined; it is public **by design** and is safe only
  as long as RLS is correct.
- Step 2 cannot detect a *value* that was inlined without its name. To rule that
  out, also grep for the first/last 16 characters of the real service-role key.
  That grep must still print nothing. **Never commit that command's output**, and
  avoid putting the literal key in your shell history where you can avoid it.

In the Vercel dashboard the same idea: **Deployment → Source → (the built
assets)** and search for `service_role`. Serverless function sources under
`api/` are not part of the browser download.

## 6. Deploying

```bash
npm i -g vercel          # once
vercel login
vercel link              # connect this checkout to the project

# Preview deployment (safe: staging env vars, throwaway URL)
vercel

# Production
vercel --prod
```

Post-deploy checklist:

1. Open the production URL with the devtools console visible — no errors.
2. Run §5 greps against the **deployed** build output if the dashboard shows the
   artifact hash (or rebuild from the same commit, which is deterministic for
   this purpose).
3. Walk [SMOKE_TEST.md](SMOKE_TEST.md) §0 (startup / honest degradation) at
   minimum; the full run belongs to the DB phase.
4. Confirm the response headers and that `/api/*` returns the honest JSON error
   shapes (e.g. `/api/wallet` with a missing token → 401, never a stack trace).

## 7. CI

`.github/workflows/ci.yml` runs on every push/PR with Node from `.nvmrc`:
`npm ci` → `npm run lint` → `npm run build` → `npm test`. It needs **no
secrets** and must stay green before a deploy. A red CI run is not a Vercel
problem; Vercel will happily deploy code that CI rejected, which is why the
GitHub check should be required on the default branch.

## 8. Rollback

- **Application:** Vercel → Deployments → the previous good deployment →
  *Promote to Production*. Immutable and instant.
- **Flags:** turning `ENABLE_WALLET_REQUESTS` or
  `ENABLE_TOURNAMENT_CANCELLATION` back to `false` (plus a redeploy) is the
  fastest way to stop money movement without a code rollback. Nothing is
  destroyed — the flows simply answer 503 / 409 with honest messages.
- **Database:** see the rollback notes in
  [DB_HANDOFF.md](DB_HANDOFF.md) §5. There is **no** `DROP`-happy rollback for
  money: refunds and approvals are ledger events, so reverse them with a
  compensating operation, never by editing balances by hand.

## 9. Things this file deliberately does not promise

- No payment provider is configured (there is none). `VITE_FEATURE_PAYMENTS`
  stays `false`.
- No custom domain, WAF, rate limiting at the edge, or observability/alerting is
  set up in the repository. The wallet rate limit is application-level only
  (documented in `api/wallet.js` and `docs/DB_REQUIREMENTS.md` §5) — a
  billing-grade limiter is DB-phase work.
- The database phase has not been applied, so a deploy today runs the legacy
  join path with **non-atomic** joins
  ([docs/AUDIT.md](AUDIT.md)). That is a known, documented risk — not a
  production-ready state.
