-- One invite per email, a "disabled" status, and changing an invite's role.
--
-- Before this, every "invite again" added a row and revoked the previous one, so one email could
-- have several rows (revoked, revoked, active) and it was hard to see what a sign-up was checking.
-- Now an email has at most one invite, in any status. Inviting it again reuses that invite: new code,
-- fresh 24 hours, attempts reset, revocation cleared. Removing the account deletes its invite
-- (previous migration), so the email can be invited again.

-- ------------------------------------------------------------ tidy existing data
-- A used invite whose account no longer exists is history for nobody.
delete from public.invites i
where i.used_at is not null
  and not exists (select 1 from auth.users u where lower(u.email) = i.email);

-- Keep one row per email: a used one if there is one (its account exists), else the live one,
-- else the most recent.
delete from public.invites i
using (
  select id,
         row_number() over (
           partition by email
           order by (used_at is not null) desc,
                    (used_at is null and revoked_at is null) desc,
                    created_at desc
         ) as rn
  from public.invites
) d
where i.id = d.id and d.rn > 1;

drop index public.invites_one_live_per_email;
create unique index invites_email_key on public.invites (email);

-- ------------------------------------------------------------------- statuses
-- Order: disabled, used, revoked, locked, expired, active. "disabled" is a used invite whose
-- account is disabled; it is used again when the account is restored.
-- Runs as the caller (so profiles' row level security applies in the list); the sign-up checks call
-- it from a function that runs as the owner.
create or replace function private.invite_status(i public.invites)
returns text
language sql
stable
as $$
  select case
    when i.used_at is not null
         and exists (select 1 from public.profiles p where p.id = i.used_by and p.status = 'disabled') then 'disabled'
    when i.used_at is not null then 'used'
    when i.revoked_at is not null then 'revoked'
    when i.failed_attempts >= private.invite_max_attempts() then 'locked'
    when i.expires_at <= now() then 'expired'
    else 'active'
  end
$$;

-- A disabled account's invite reads as "used" to a sign-up: the email already has an account.
create or replace function private.invite_rejection_message(p_outcome text)
returns text
language sql
immutable
as $$
  select case p_outcome
    when 'ok' then null
    when 'no_invite' then 'INVITE_NO_INVITE: There is no invite for this email address.'
    when 'wrong_code' then 'INVITE_WRONG_CODE: That invite code is incorrect.'
    when 'expired' then 'INVITE_EXPIRED: This invite has expired. Ask for a new code.'
    when 'used' then 'INVITE_USED: This invite has already been used.'
    when 'disabled' then 'INVITE_USED: This invite has already been used.'
    when 'revoked' then 'INVITE_REVOKED: This invite was revoked. Ask for a new code.'
    when 'locked' then 'INVITE_LOCKED: This invite is locked after too many wrong attempts. Ask for a new code.'
    else 'INVITE_INVALID: This invite code cannot be used.'
  end
$$;

-- ----------------------------------------------------------------- the check
-- Same as before, but there is exactly one invite per email to look at.
create or replace function private.check_invite(p_email text, p_code text, p_record_failure boolean default false)
returns table (invite_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code text := private.normalize_invite_code(p_code);
  inv public.invites;
  st text;
begin
  select * into inv from public.invites where email = v_email;
  if not found then
    return query select null::uuid, 'no_invite'::text;
    return;
  end if;

  st := private.invite_status(inv);
  if st <> 'active' then
    return query select inv.id, st;
    return;
  end if;

  if length(v_code) = 8 and extensions.crypt(v_code, inv.code_hash) = inv.code_hash then
    return query select inv.id, 'ok'::text;
    return;
  end if;

  if p_record_failure then
    update public.invites set failed_attempts = failed_attempts + 1 where id = inv.id;
  end if;
  return query select inv.id, 'wrong_code'::text;
end;
$$;

-- ------------------------------------------------------------------- issuing
-- Create and regenerate both come here. An existing unused invite for the email is reused.
create or replace function private.issue_invite(p_actor uuid, p_email text, p_role public.app_role)
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

  v_code := private.generate_invite_code();
  insert into public.invites (email, role, code_hash, created_by)
  values (v_email, p_role, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), p_actor)
  on conflict (email) do update
    set role = excluded.role,
        code_hash = excluded.code_hash,
        created_by = excluded.created_by,
        created_at = now(),
        expires_at = now() + interval '24 hours',
        failed_attempts = 0,
        revoked_at = null,
        revoked_by = null
    where public.invites.used_at is null
  returning id, expires_at into v_id, v_expires;

  if v_id is null then
    -- A used invite means an account was made from it, which the check above should have caught.
    raise exception 'INVITE_ACCOUNT_EXISTS: An account already exists for this email.';
  end if;

  return query select v_id, private.format_invite_code(v_code), v_expires;
end;
$$;

-- ----------------------------------------------------------------- the role
-- Devops may change any unused, unrevoked invite's role; an admin only their own. The code and the
-- expiry stay as they are.
create function public.update_invite_role(p_invite_id uuid, p_role public.app_role)
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
    raise exception 'INVITE_FORBIDDEN: You are not allowed to change invites.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'INVITE_BAD_ROLE: Invites can only be for the member or admin role.' using errcode = '22023';
  end if;

  select * into inv from public.invites where id = p_invite_id for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND: That invite does not exist.';
  end if;
  if v_role = 'admin' and inv.created_by is distinct from v_actor then
    raise exception 'INVITE_FORBIDDEN: You can only change invites you created.' using errcode = '42501';
  end if;
  if inv.used_at is not null then
    raise exception 'INVITE_ALREADY_USED: This invite has already been used.';
  end if;
  if inv.revoked_at is not null then
    raise exception 'INVITE_NOT_EDITABLE: This invite is revoked. Regenerate it to use it again.';
  end if;

  update public.invites set role = p_role where id = inv.id;
end;
$$;

revoke all on function public.update_invite_role(uuid, public.app_role) from public, anon;
grant execute on function public.update_invite_role(uuid, public.app_role) to authenticated;
