-- Create, revoke, and regenerate invites (design D3).
-- These are the ONLY way to change invites. They run as the function owner, but every one
-- starts by reading the caller's CURRENT role (private.actor_role), so a disabled or demoted
-- user is refused even while their token is still valid.
-- Errors carry a stable prefix before the colon, which the web app turns into a message.

-- Shared by create and regenerate. Callers have already checked who is allowed to invite.
create function private.issue_invite(p_actor uuid, p_email text, p_role public.app_role)
returns table (new_invite_id uuid, new_code text, new_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_status public.account_status;
  v_code text;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'INVITE_BAD_ROLE: Invites can only be for the member or admin role.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVITE_BAD_EMAIL: Enter a valid email address.' using errcode = '22023';
  end if;

  -- One decision per email at a time.
  perform pg_advisory_xact_lock(hashtext('invites:' || v_email));

  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  if found then
    select pr.status into v_status from public.profiles pr where pr.id = v_user;
    if v_status = 'disabled' then
      raise exception 'INVITE_ACCOUNT_DISABLED: This email belongs to a disabled account. Restore that account instead of inviting.';
    end if;
    raise exception 'INVITE_ACCOUNT_EXISTS: An account already exists for this email.';
  end if;

  -- A new invite replaces any live one.
  update public.invites
  set revoked_at = now(), revoked_by = p_actor
  where email = v_email and used_at is null and revoked_at is null;

  v_code := private.generate_invite_code();
  insert into public.invites (email, role, code_hash, created_by)
  values (v_email, p_role, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), p_actor)
  returning id, expires_at into v_id, v_expires;

  return query select v_id, private.format_invite_code(v_code), v_expires;
end;
$$;

revoke all on function private.issue_invite(uuid, text, public.app_role) from public, anon, authenticated;

-- Devops and admin may create member or admin invites.
create function public.create_invite(p_email text, p_role public.app_role)
returns table (new_invite_id uuid, new_code text, new_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.actor_role();
begin
  if v_actor is null or v_role is null or v_role not in ('devops', 'admin') then
    raise exception 'INVITE_FORBIDDEN: You are not allowed to create invites.' using errcode = '42501';
  end if;
  return query select * from private.issue_invite(v_actor, p_email, p_role);
end;
$$;

-- Devops may revoke any unused invite, an admin only their own.
create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.actor_role();
  inv public.invites;
begin
  if v_actor is null or v_role is null or v_role not in ('devops', 'admin') then
    raise exception 'INVITE_FORBIDDEN: You are not allowed to revoke invites.' using errcode = '42501';
  end if;

  select * into inv from public.invites where id = p_invite_id for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND: That invite does not exist.';
  end if;
  if v_role = 'admin' and inv.created_by is distinct from v_actor then
    raise exception 'INVITE_FORBIDDEN: You can only revoke invites you created.' using errcode = '42501';
  end if;
  if inv.used_at is not null then
    raise exception 'INVITE_ALREADY_USED: This invite has already been used.';
  end if;
  if inv.revoked_at is not null then
    raise exception 'INVITE_ALREADY_REVOKED: This invite is already revoked.';
  end if;

  update public.invites set revoked_at = now(), revoked_by = v_actor where id = inv.id;
end;
$$;

-- Same people as revoke. Revokes the live invite for the email and issues a fresh code for
-- the same email and role. A used invite cannot be regenerated: the account exists.
create function public.regenerate_invite(p_invite_id uuid)
returns table (new_invite_id uuid, new_code text, new_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.actor_role();
  inv public.invites;
begin
  if v_actor is null or v_role is null or v_role not in ('devops', 'admin') then
    raise exception 'INVITE_FORBIDDEN: You are not allowed to regenerate invites.' using errcode = '42501';
  end if;

  select * into inv from public.invites where id = p_invite_id for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND: That invite does not exist.';
  end if;
  if v_role = 'admin' and inv.created_by is distinct from v_actor then
    raise exception 'INVITE_FORBIDDEN: You can only regenerate invites you created.' using errcode = '42501';
  end if;
  if inv.used_at is not null then
    raise exception 'INVITE_ALREADY_USED: This invite has already been used, so there is nothing to regenerate.';
  end if;

  return query select * from private.issue_invite(v_actor, inv.email, inv.role);
end;
$$;

revoke all on function public.create_invite(text, public.app_role) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.regenerate_invite(uuid) from public, anon;
grant execute on function public.create_invite(text, public.app_role) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;
