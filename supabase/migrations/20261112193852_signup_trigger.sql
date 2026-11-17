-- Gate 2: every new authentication user gets a profile in the same transaction (design D6).
--
--   no invite code    -> member / pending
--   a valid code      -> role from the invite / active, and the invite is used up
--   any other code    -> the insert is rolled back, so no account exists
--
-- Only the invite code is read from the sign-up data. A role or status sent by the visitor,
-- or by the privileged script that creates the first devops, is ignored; that script sets the
-- role afterwards. The code is a "use it or fail" gate even when the hook (gate 1) is off.

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := new.raw_user_meta_data ->> 'invite_code';
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_invite_id uuid;
  v_outcome text;
  v_role public.app_role;
begin
  if btrim(coalesce(v_code, '')) = '' then
    insert into public.profiles (id, email, role, status)
    values (new.id, v_email, 'member', 'pending');
  else
    select c.invite_id, c.outcome into v_invite_id, v_outcome
    from private.check_invite(v_email, v_code, false) c;

    if v_outcome <> 'ok' then
      raise exception '%', private.invite_rejection_message(v_outcome);
    end if;

    -- Use up the invite. The conditions repeat the status rules, so of two sign-ups racing for
    -- one code only one finds an unused row; the other waits on the row lock and then matches nothing.
    update public.invites
    set used_at = now(), used_by = new.id
    where id = v_invite_id
      and used_at is null
      and revoked_at is null
      and failed_attempts < private.invite_max_attempts()
      and expires_at > now()
    returning role into v_role;

    if not found then
      raise exception '%', private.invite_rejection_message('used');
    end if;

    insert into public.profiles (id, email, role, status)
    values (new.id, v_email, v_role, 'active');
  end if;

  -- Do not leave the code readable in the stored sign-up data.
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'invite_code'
  where id = new.id;

  return null;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- The Auth service rewrites a new user's stored metadata a moment after the insert, which would
-- put a code removed above back. So the key is stripped on every write to that column.
create function private.strip_invite_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'invite_code' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'invite_code';
  end if;
  return new;
end;
$$;

revoke all on function private.strip_invite_code() from public, anon, authenticated;

create trigger strip_invite_code_on_update
  before update of raw_user_meta_data on auth.users
  for each row execute function private.strip_invite_code();
