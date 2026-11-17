-- Gate 1: the before-user-created hook (design D5). It gives clear messages. Gate 2, the
-- trigger on auth.users, enforces the same rules in the same transaction as the insert.
--
--   no invite code        -> allow (the trigger makes a pending member)
--   a code that checks out -> allow (the trigger makes an active account)
--   any other code        -> reject, with a message that starts with a stable code

-- One place for the sign-up rejection messages, used by the hook (gate 1) and the trigger (gate 2).
-- The text before the colon is a stable code that the web app maps to its own message.
create function private.invite_rejection_message(p_outcome text)
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
    when 'revoked' then 'INVITE_REVOKED: This invite was revoked. Ask for a new code.'
    when 'locked' then 'INVITE_LOCKED: This invite is locked after too many wrong attempts. Ask for a new code.'
    else 'INVITE_INVALID: This invite code cannot be used.'
  end
$$;

revoke all on function private.invite_rejection_message(text) from public, anon, authenticated;
grant execute on function private.invite_rejection_message(text) to supabase_auth_admin;

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_email text := event -> 'user' ->> 'email';
  v_code text := event -> 'user' -> 'user_metadata' ->> 'invite_code';
  v_outcome text;
  v_message text;
begin
  if btrim(coalesce(v_code, '')) = '' then
    return '{}'::jsonb;
  end if;

  -- Records a failed attempt. The write survives the rejection below (verified on the local stack).
  select c.outcome into v_outcome from private.check_invite(v_email, v_code, true) c;

  v_message := private.invite_rejection_message(v_outcome);

  if v_message is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', v_message));
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
