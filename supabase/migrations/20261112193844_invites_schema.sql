-- Invite codes (design D1). One row per invite; the code itself is never stored, only a
-- salted bcrypt hash. Status is derived, never stored, so it cannot go stale.

create extension if not exists pgcrypto with schema extensions;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  -- Stored trimmed and lower case; create_invite normalizes before inserting.
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role public.app_role not null check (role in ('member', 'admin')),
  code_hash text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0)
);

comment on table public.invites is
  'Invite codes. code_hash is a salted bcrypt hash; the plaintext code is shown once at creation and never stored.';

-- At most one live (unused, unrevoked) invite per email. Expired and locked invites are still
-- "live" until revoked or replaced, so creating a new invite must revoke the old one first.
create unique index invites_one_live_per_email
  on public.invites (email)
  where used_at is null and revoked_at is null;

create index invites_email_created_idx on public.invites (email, created_at desc);

-- ------------------------------------------------------------------ status
-- Failed attempts after which an invite locks.
create function private.invite_max_attempts()
returns integer
language sql
immutable
as $$ select 10 $$;

-- The one definition of an invite's status, used by the view and by the sign-up checks.
-- Precedence: used, revoked, locked, expired, active.
create function private.invite_status(i public.invites)
returns text
language sql
stable
as $$
  select case
    when i.used_at is not null then 'used'
    when i.revoked_at is not null then 'revoked'
    when i.failed_attempts >= private.invite_max_attempts() then 'locked'
    when i.expires_at <= now() then 'expired'
    else 'active'
  end
$$;

revoke all on function private.invite_max_attempts() from public, anon;
revoke all on function private.invite_status(public.invites) from public, anon;
grant execute on function private.invite_max_attempts() to authenticated;
grant execute on function private.invite_status(public.invites) to authenticated;

-- ----------------------------------------------------------------- security
alter table public.invites enable row level security;
revoke all on public.invites from public, anon, authenticated;
-- Read only. All changes go through the create/revoke/regenerate functions.
grant select on public.invites to authenticated;

-- Devops reads every invite.
create policy invites_select_devops
  on public.invites for select to authenticated
  using ((select private.actor_role()) = 'devops');

-- Anyone else active reads only the invites they created.
create policy invites_select_own
  on public.invites for select to authenticated
  using (created_by = (select auth.uid()) and (select private.actor_role()) is not null);

-- ---------------------------------------------------------------------- view
-- What the Invites screen reads. security_invoker makes RLS apply to the caller.
create view public.invite_list
with (security_invoker = true)
as
select
  i.id,
  i.email,
  i.role,
  private.invite_status(i) as status,
  i.created_at,
  i.expires_at,
  i.used_at,
  i.revoked_at,
  i.failed_attempts,
  i.created_by,
  p.email as created_by_email
from public.invites i
left join public.profiles p on p.id = i.created_by;

revoke all on public.invite_list from public, anon, authenticated;
grant select on public.invite_list to authenticated;
