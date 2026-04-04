alter table if exists public.profiles
  add column if not exists is_admin boolean not null default false;
