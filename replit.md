# START HERE — mandatory session protocol

Before doing **any** work in a new agent session:

1. Read this file, `docs/PROJECT_STATE.md`, and `docs/DB_REQUIREMENTS.md` in full.
2. Write a **10-line understanding summary** of the current project state, deployed database contract, safety constraints, feature-flag state, and open work.
3. **Wait for the user's task** after that summary; do not inspect, edit, run, or deploy anything until a task is supplied.
4. Work only on the Arena-assigned branch (`arena/b00f9890-clasharena` for this session). Update the existing PR; never create another branch or PR unless the user explicitly changes that instruction.
5. Never write, edit, or run SQL and never touch Supabase unless the user explicitly lifts that restriction. In particular, do not edit `supabase/proposed/*.sql` for documentation-only contract corrections.
6. Do not change feature-flag values without an explicit user instruction. Database-backed features must fail honestly when their database piece is absent.
7. Preserve player privacy: ordinary player-facing profile/result data must never expose phone numbers. Tournament prizes are recorded standings; payouts remain manual unless a real approved payment path exists.
8. At task end, update `docs/PROJECT_STATE.md` with completed work, unchanged flags, and open items; run the requested real checks; commit and push on the assigned branch; then stop. Never merge an existing PR unless the user explicitly asks.

# ClashArena

## PERMANENT RULES — follow on every task

1. Never expose service-role keys or secrets in frontend code, logs or commits. Never commit `.env`.
2. Never trust client-supplied `userId`, `role`, `balance`, entry fee, transaction status or player counts.
3. Hiding a UI button is never authorization. Admin checks happen server-side.
4. No fake payments, no buttons that look functional but are not, no invented transactions or balances.
5. Do not break working features. Keep API response shapes backward compatible. Work in small steps and run the build after each step.
6. Do not claim a test/build passed unless you actually ran it and saw the output.
7. Database-dependent features must sit behind feature flags (`src/config/features.js` for the client, env vars for the server) and degrade gracefully with an honest message when the DB piece is missing.

## Project

A Free Fire tournament mobile-style web app built with Vite + React.

## Tech Stack
- **Frontend**: React 18 + Vite (port 5000)
- **Animations**: Framer Motion
- **Auth & DB**: Supabase
- **Icons**: Lucide React
- **Styling**: Custom CSS (dark esports theme)

## Key Files
- `src/App.jsx` - Main app (all components in one file)
- `src/App.css` - All styles
- `src/lib/supabaseClient.js` - Supabase client
- `vite.config.js` - Vite config (port 5000, strictPort)
- `.env` - Supabase credentials

## Supabase Tables
- `profiles` - id, username, level, wins, role, balance, ff_id, nickname
- `tournaments` - id, name, mode, prize, entry_fee, max_players, current_players, status, match_time, room_id, room_password, image_url, rules
- `match_registrations` - id, tournament_id, user_id, ff_uid, ign, status

## Features
- Login/Signup via Supabase Auth
- Home: Tournament listing with loading skeletons
- Tournament Detail: Join flow with FF UID/IGN input, room ID reveal
- Wallet: Balance display with add/withdraw
- Profile: Edit FF UID/Nickname, social links, logout
- Admin Panel (role=admin): Create/edit/delete tournaments, stats dashboard

## Animations (Framer Motion)
- Page transitions with fade+slide (AnimatePresence)
- Card hover (scale 1.03) and tap (scale 0.97)
- Button whileTap scale 0.95
- Modal spring animation
- Staggered list entry
- Balance pill glow pulse
- Hero animated gradient glow
- Loading skeleton shimmer
- Bottom nav active indicator with layoutId

## Port Setup
- Runs on port 5000 (strictPort)
- `npm run dev` kills port 5000 first, then starts Vite
- `.env` has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
