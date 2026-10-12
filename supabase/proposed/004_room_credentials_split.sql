-- ============================================================================
-- NOT APPLIED. For the database phase.
-- 004_room_credentials_split.sql  [recommended, closes AUDIT P0-3]
-- Moves room_id/room_password into a dedicated table readable by nobody
-- client-side; participants get them only via get_room_details() (file 003).
--
-- ⚠ COORDINATION WARNING (permanent rule 5 — do not break working features):
--    Part A (table + data copy) is safe to apply alone.
--    Part B (column lockdown) BREAKS the current client, because the app
--    reads tournaments with select('*') (src/App.jsx:363) and reveals room
--    details from that payload (src/App.jsx:653-654). Apply Part B ONLY in
--    the same release as the client change that switches to
--    get_room_details() and drops select('*'). Until then Part B stays
--    commented out. If applied early, the Room ID / Password reveal breaks
--    for all users.
-- Idempotent: precondition-checked throughout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part A — new credentials table, RLS, one-time data copy (safe)
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_room_credentials (
  tournament_id uuid primary key
    references public.tournaments (id) on delete cascade,
  room_id       text,
  room_password text,
  updated_at    timestamptz not null default now()
);

alter table public.tournament_room_credentials enable row level security;

-- Deliberately NO policies: neither anon nor authenticated can select,
-- insert, update or delete directly. The service-role key (api/*) and the
-- security-definer function get_room_details() (003) are the only access
-- paths. [required by code for safety]

-- One-time copy of existing credentials. Idempotent: ON CONFLICT do nothing.
insert into public.tournament_room_credentials (tournament_id, room_id, room_password)
select id, room_id, room_password
from public.tournaments
where room_id is not null or room_password is not null
on conflict (tournament_id) do nothing;

-- ---------------------------------------------------------------------------
-- Part B — lock the leaked columns on tournaments. COMMENTED OUT ON PURPOSE.
-- Enable only together with the matching client change (see warning above).
-- ---------------------------------------------------------------------------
-- Step B1: stop column reads by non-admin roles. After REVOKE + the GRANT
-- below, `select *` on tournaments fails for anon/authenticated (PostgREST
-- returns an error), so the client must already have dropped select('*').
--
-- revoke select on public.tournaments from anon, authenticated;
-- grant select (id, name, mode, prize, entry_fee, max_players, current_players,
--                status, match_time, image_url, rules, created_at)
--   on public.tournaments to anon, authenticated;
--
-- Step B2: write access for admins is unchanged (002 policies remain), but
-- room columns are now maintained through tournament_room_credentials. Until
-- the admin UI is updated, admins can still write the legacy columns via the
-- service-role key; the copy step should then be re-run (it is idempotent).
--
-- Step B3 (final, later phase): drop the legacy columns entirely once no
-- code path reads them:
--   alter table public.tournaments drop column if exists room_id;
--   alter table public.tournaments drop column if exists room_password;

-- End of 004. Nothing in this file has been executed anywhere.
