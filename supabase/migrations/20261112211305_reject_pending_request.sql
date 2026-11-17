-- Rejecting a pending sign-up request (add-account-management design D1).
--
-- Rejecting deletes the account. The profile rules refuse every delete by a signed-in user, so
-- there is exactly one way through: reject_pending_request() checks the caller's live role, checks
-- the account is pending, tells the rules "I vouch for this one delete" with a transaction-local
-- setting naming that account, and deletes it. The rules honor the setting only for a delete of
-- that same row while it is still pending. Everything else stays refused.

-- Same function as before (20261112172908), with one change: a vouched delete skips the actor checks.
create or replace function private.enforce_profile_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_is public.app_role;
  was_active_devops boolean := false;
  becomes_active_devops boolean := false;
  other_active_devops integer;
  after_count integer;
  vouched boolean := false;
begin
  -- One headcount decision at a time, so two concurrent changes cannot both pass.
  perform pg_advisory_xact_lock(hashtext('public.profiles.devops_headcount'));

  if tg_op <> 'INSERT' then
    was_active_devops := old.role = 'devops' and old.status = 'active';
  end if;
  if tg_op <> 'DELETE' then
    becomes_active_devops := new.role = 'devops' and new.status = 'active';
  end if;

  -- reject_pending_request() names the one pending account it is deleting.
  if tg_op = 'DELETE' then
    vouched := old.status = 'pending'
      and coalesce(current_setting('app.rejecting_user', true), '') = old.id::text;
  end if;

  -- ------------------------------------------------------------- actor rules
  if actor is not null and not vouched then
    if tg_op in ('INSERT', 'DELETE') then
      raise exception 'Profiles cannot be created or deleted by users.' using errcode = '42501';
    end if;

    if new.id <> old.id then
      raise exception 'A profile id cannot change.' using errcode = '42501';
    end if;

    if new.role is distinct from old.role or new.status is distinct from old.status then
      if old.id = actor then
        raise exception 'You cannot change your own role or status.' using errcode = '42501';
      end if;

      actor_is := private.actor_role();

      if actor_is is null or actor_is = 'member' then
        raise exception 'You are not allowed to change accounts.' using errcode = '42501';
      end if;

      if actor_is = 'admin' then
        if old.role <> 'member' then
          raise exception 'Admins can only act on members.' using errcode = '42501';
        end if;
        if new.role not in ('member', 'admin') then
          raise exception 'Admins can only promote a member to admin.' using errcode = '42501';
        end if;
        if new.status not in ('active', 'disabled') then
          raise exception 'Admins can only set a member active or disabled.' using errcode = '42501';
        end if;
      end if;
      -- devops: any change, subject to the headcount rules below.
    end if;
  end if;

  -- --------------------------------------------------------- headcount rules
  select count(*) into other_active_devops
  from public.profiles p
  where p.role = 'devops'
    and p.status = 'active'
    and p.id <> case when tg_op = 'DELETE' then old.id else new.id end;

  after_count := other_active_devops + case when becomes_active_devops then 1 else 0 end;

  if after_count > 2 and not was_active_devops then
    raise exception 'There can be at most 2 active devops accounts.' using errcode = '23514';
  end if;

  if after_count < 1 and was_active_devops then
    raise exception 'There must always be at least 1 active devops account.' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Devops and admin may reject a pending account. Anything that is not pending is refused.
create function public.reject_pending_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := private.actor_role();
  prof public.profiles;
begin
  if v_actor is null or v_role is null or v_role not in ('devops', 'admin') then
    raise exception 'PEOPLE_FORBIDDEN: You are not allowed to reject requests.' using errcode = '42501';
  end if;

  select * into prof from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PEOPLE_NOT_FOUND: That request no longer exists.';
  end if;
  if prof.status <> 'pending' then
    raise exception 'PEOPLE_NOT_PENDING: That request has already been handled.';
  end if;
  -- An admin acts on members only; a pending account is a member, but check rather than assume.
  if v_role = 'admin' and prof.role <> 'member' then
    raise exception 'PEOPLE_FORBIDDEN: You are not allowed to reject that request.' using errcode = '42501';
  end if;

  -- Vouch for this one delete (the setting lasts to the end of the transaction), then clear it.
  perform set_config('app.rejecting_user', p_user_id::text, true);
  delete from auth.users where id = p_user_id;
  perform set_config('app.rejecting_user', '', true);
end;
$$;

revoke all on function public.reject_pending_request(uuid) from public, anon;
grant execute on function public.reject_pending_request(uuid) to authenticated;
