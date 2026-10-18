-- ============================================================================
-- NOT APPLIED. For the database phase.
-- OUTDATED - written for uuid ids.
-- The live database was changed separately; do not apply.
-- 002_rls_policies.sql
-- Row Level Security for all four tables. The Supabase anon key is public
-- (src/lib/supabaseClient.js), so RLS is the primary authorization layer.
-- The service-role key used by api/* bypasses RLS by design.
-- Idempotent: policies are dropped and recreated only when definitions change.
-- Companion docs: docs/DB_REQUIREMENTS.md §2, docs/AUDIT.md P0-3/P0-4/P0-5
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: is_admin() — security definer so the profiles subquery does not
-- recurse into the profiles RLS policies. [required by code: admin gates]
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.tournaments         enable row level security;
alter table public.match_registrations enable row level security;
alter table public.transactions        enable row level security;

-- ---------------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);
-- [required by code: own profile fetch — App.jsx:352]

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());
-- [required by code: admin registered-players view joins profiles(username) — App.jsx:1056-1058]

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  with check (auth.uid() = id);
-- [required by code: signup profile insert — App.jsx:152-159]
-- role/balance injection on this insert is blocked by the trigger in
-- 003_functions_triggers.sql (protect_profiles_columns).

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- [required by code: profile edit — App.jsx:763-770]
-- Column restriction (ff_id/nickname/avatar_url only) is enforced by the
-- same 003 trigger; RLS alone cannot restrict columns.

-- no delete policy for profiles: clients must never delete profiles. [recommended]

-- ---------------------------------------------------------------------------
-- 3. tournaments
-- ---------------------------------------------------------------------------
drop policy if exists "tournaments_select_authenticated" on public.tournaments;
create policy "tournaments_select_authenticated"
  on public.tournaments for select
  using (auth.role() = 'authenticated');
-- [required by code: home list App.jsx:363, detail view, MyMatches App.jsx:1403-1417]
-- KNOWN GAP (AUDIT P0-3): this also exposes room_id/room_password to every
-- signed-in user, because the client selects '*'. Closing it requires
-- 004_room_credentials_split.sql plus a coordinated client change. Do NOT
-- tighten this policy unilaterally or the home list breaks.

drop policy if exists "tournaments_insert_admin" on public.tournaments;
create policy "tournaments_insert_admin"
  on public.tournaments for insert
  with check (public.is_admin());
-- [required by code for safety: admin create runs client-side — App.jsx:1098-1108]

drop policy if exists "tournaments_update_admin" on public.tournaments;
create policy "tournaments_update_admin"
  on public.tournaments for update
  using (public.is_admin())
  with check (public.is_admin());
-- [required by code for safety: admin edit runs client-side — App.jsx:1122-1129]

drop policy if exists "tournaments_delete_admin" on public.tournaments;
create policy "tournaments_delete_admin"
  on public.tournaments for delete
  using (public.is_admin());
-- [recommended: defense in depth for api/deleteTournament.js, which today
--  bypasses RLS via the service-role key]

-- ---------------------------------------------------------------------------
-- 4. match_registrations
-- ---------------------------------------------------------------------------
drop policy if exists "match_registrations_select_own" on public.match_registrations;
create policy "match_registrations_select_own"
  on public.match_registrations for select
  using (auth.uid() = user_id);
-- [required by code: MyMatches App.jsx:1418, duplicate check App.jsx:571,583]

drop policy if exists "match_registrations_select_admin" on public.match_registrations;
create policy "match_registrations_select_admin"
  on public.match_registrations for select
  using (public.is_admin());
-- [required by code: admin registered-players list — App.jsx:1054-1072]

-- Deliberately NO insert/update/delete policies for clients. [recommended]
-- All writes go through api/* with the service-role key (which bypasses RLS),
-- and after the DB phase through join_tournament() (003). An absent insert
-- policy means anonymous/browser users cannot fabricate registrations.

-- ---------------------------------------------------------------------------
-- 5. transactions
-- ---------------------------------------------------------------------------
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);
-- [required by code: wallet — App.jsx:684. This is the authoritative fix for
--  AUDIT P0-5; the client-side filter is a second layer.]

-- Deliberately NO insert/update/delete policies: only the server's
-- service-role key writes transactions (api/joinTournament.js:119-124).
-- [required by code for safety]

-- End of 002. Nothing in this file has been executed anywhere.
