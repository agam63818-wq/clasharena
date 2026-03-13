# ClashArena

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
