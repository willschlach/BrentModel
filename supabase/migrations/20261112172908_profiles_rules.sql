-- Who may change what on profiles, and the devops headcount limits.
-- See design.md D4. RLS (previous migration) picks the rows a caller may touch;
-- this trigger checks the exact change, because policies cannot compare old and new.
--
-- Callers with no auth.uid() (the secret key, the SQL editor, migrations) are privileged
-- and skip the actor rules, but the headcount rules apply to everyone.

create function private.enforce_profile_rules()
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
begin
  -- One headcount decision at a time, so two concurrent changes cannot both pass.
  perform pg_advisory_xact_lock(hashtext('public.profiles.devops_headcount'));

  if tg_op <> 'INSERT' then
    was_active_devops := old.role = 'devops' and old.status = 'active';
  end if;
  if tg_op <> 'DELETE' then
    becomes_active_devops := new.role = 'devops' and new.status = 'active';
  end if;

  -- ------------------------------------------------------------- actor rules
  if actor is not null then
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

revoke all on function private.enforce_profile_rules() from public, anon, authenticated;

create trigger profiles_enforce_rules
  before insert or update or delete on public.profiles
  for each row execute function private.enforce_profile_rules();
