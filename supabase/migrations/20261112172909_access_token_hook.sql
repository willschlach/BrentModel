-- Custom access token hook (design D2).
-- Adds user_role and user_status claims for active accounts, and refuses to issue a token
-- for disabled, pending, or profile-less accounts. The message starts with a stable code
-- that the web app maps to a user-facing message. Do NOT touch the built-in "role" claim:
-- Postgres uses it to choose the database role.

create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  p record;
  claims jsonb;
begin
  select pr.role, pr.status into p
  from public.profiles pr
  where pr.id = (event ->> 'user_id')::uuid;

  if not found then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'ACCOUNT_NO_ROLE: This account has no access.'));
  end if;

  if p.status = 'disabled' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'ACCOUNT_DISABLED: This account has been disabled.'));
  end if;

  if p.status = 'pending' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'ACCOUNT_PENDING: This account is awaiting approval.'));
  end if;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(p.role::text));
  claims := jsonb_set(claims, '{user_status}', to_jsonb(p.status::text));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the Auth service may run the hook.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
