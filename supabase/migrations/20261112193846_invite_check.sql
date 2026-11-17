-- Invite code generation, normalization, and the single check used by both sign-up gates
-- (design D2, D4). Nothing here is callable by browsers.

-- 31 characters: digits 2-9 and letters A-Z without I, L, O. About 39.6 bits for 8 characters.
-- A byte >= 248 (31 * 8) is skipped so every character is equally likely.
create function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  bytes bytea;
  i integer;
begin
  while length(result) < 8 loop
    bytes := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      if get_byte(bytes, i) < 248 then
        result := result || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
        exit when length(result) = 8;
      end if;
    end loop;
  end loop;
  return result;
end;
$$;

-- Case, spaces, hyphens and any character outside the alphabet are ignored.
create function private.normalize_invite_code(code text)
returns text
language sql
immutable
as $$
  select regexp_replace(upper(coalesce(code, '')), '[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]', '', 'g')
$$;

create function private.format_invite_code(code text)
returns text
language sql
immutable
as $$
  select substr(code, 1, 4) || '-' || substr(code, 5, 4)
$$;

-- Looks up the invite for an email and says what a sign-up with this code would get.
--   ok | no_invite | wrong_code | expired | used | revoked | locked
-- State is judged before the code, so a locked or expired invite is reported as such even
-- when the code is right. Only a wrong code counts as a failed attempt, and only when asked to.
create function private.check_invite(p_email text, p_code text, p_record_failure boolean default false)
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
  -- The live invite if there is one, otherwise the most recent, so "used" and "revoked" can be reported.
  select * into inv from public.invites
  where email = v_email and used_at is null and revoked_at is null;
  if not found then
    select * into inv from public.invites
    where email = v_email
    order by created_at desc
    limit 1;
  end if;
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

revoke all on function private.generate_invite_code() from public, anon, authenticated;
revoke all on function private.normalize_invite_code(text) from public, anon, authenticated;
revoke all on function private.format_invite_code(text) from public, anon, authenticated;
revoke all on function private.check_invite(text, text, boolean) from public, anon, authenticated;
-- The before-user-created hook runs as the Auth service role and calls the check.
grant execute on function private.check_invite(text, text, boolean) to supabase_auth_admin;
