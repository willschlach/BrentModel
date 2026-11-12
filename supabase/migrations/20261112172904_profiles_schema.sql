-- Roles and account states, and the one profile row per account.
-- See openspec/changes/add-auth-foundation/design.md (D1, D3).

create type public.app_role as enum ('devops', 'admin', 'member');
create type public.account_status as enum ('pending', 'active', 'disabled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.app_role not null,
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per account. Role and status decide access; see private.actor_role() and the profile rules trigger.';

alter table public.profiles enable row level security;

-- Supabase grants broad default privileges on new public tables. Start from nothing.
revoke all on public.profiles from public, anon, authenticated;

-- Signed-in users may read (RLS narrows which rows) and update only role and status
-- (RLS and the rules trigger narrow who may change what). No client insert or delete.
grant select on public.profiles to authenticated;
grant update (role, status) on public.profiles to authenticated;

-- The Auth service reads profiles when it runs the access token hook.
grant select on public.profiles to supabase_auth_admin;
