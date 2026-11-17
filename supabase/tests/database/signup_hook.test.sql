-- Gate 1: the before-user-created hook (spec: account-signup; design D5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.mk(p_email text, p_code text, p_attempts int default 0, p_expires interval default '24 hours',
                           p_used boolean default false, p_revoked boolean default false) returns void language sql as $$
  insert into public.invites (email, role, code_hash, failed_attempts, expires_at, used_at, revoked_at, created_at)
  values (p_email, 'member', extensions.crypt(p_code, extensions.gen_salt('bf', 4)), p_attempts,
          now() + p_expires, case when p_used then now() end, case when p_revoked then now() end, now() - interval '1 minute')
$$;
create function pg_temp.hook(p_email text, p_meta jsonb) returns jsonb language sql as $$
  select public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', p_email, 'user_metadata', p_meta)))
$$;
create function pg_temp.msg(j jsonb) returns text language sql as $$ select j #>> '{error,message}' $$;

select pg_temp.mk('ok@t.local', 'K7MQ2WXA');
select pg_temp.mk('exp@t.local', 'K7MQ2WXA', p_expires => interval '-1 hour');
select pg_temp.mk('used@t.local', 'K7MQ2WXA', p_used => true);
select pg_temp.mk('rev@t.local', 'K7MQ2WXA', p_revoked => true);
select pg_temp.mk('lock@t.local', 'K7MQ2WXA', p_attempts => 10);

-- No code: allowed, and nothing is recorded.
select is(pg_temp.hook('anyone@t.local', '{}'::jsonb), '{}'::jsonb, 'no metadata at all is allowed');
select is(pg_temp.hook('anyone@t.local', '{"invite_code": "   "}'::jsonb), '{}'::jsonb, 'a blank code counts as no code');
select is(pg_temp.hook('ok@t.local', '{"other": "x"}'::jsonb), '{}'::jsonb, 'other metadata is not a code');

-- A valid code, in several spellings.
select is(pg_temp.hook('ok@t.local', '{"invite_code": "K7MQ-2WXA"}'::jsonb), '{}'::jsonb, 'a valid code is allowed');
select is(pg_temp.hook('OK@t.local', '{"invite_code": "k7mq2wxa"}'::jsonb), '{}'::jsonb, 'case and a missing hyphen are fine');

-- Each rejection has its own code and a 400.
select matches(pg_temp.msg(pg_temp.hook('ghost@t.local', '{"invite_code": "K7MQ2WXA"}'::jsonb)), '^INVITE_NO_INVITE: ', 'no invite for the email');
select matches(pg_temp.msg(pg_temp.hook('ok@t.local', '{"invite_code": "AAAA-AAAA"}'::jsonb)), '^INVITE_WRONG_CODE: ', 'wrong code');
select matches(pg_temp.msg(pg_temp.hook('exp@t.local', '{"invite_code": "K7MQ2WXA"}'::jsonb)), '^INVITE_EXPIRED: ', 'expired');
select matches(pg_temp.msg(pg_temp.hook('used@t.local', '{"invite_code": "K7MQ2WXA"}'::jsonb)), '^INVITE_USED: ', 'used');
select matches(pg_temp.msg(pg_temp.hook('rev@t.local', '{"invite_code": "K7MQ2WXA"}'::jsonb)), '^INVITE_REVOKED: ', 'revoked');
select matches(pg_temp.msg(pg_temp.hook('lock@t.local', '{"invite_code": "K7MQ2WXA"}'::jsonb)), '^INVITE_LOCKED: ', 'locked, even with the right code');
select is((pg_temp.hook('ok@t.local', '{"invite_code": "AAAA-AAAA"}'::jsonb) #>> '{error,http_code}')::int, 400, 'a rejection is a 400');
select matches(pg_temp.msg(pg_temp.hook('ok@t.local', '{"invite_code": "OOOO-0000"}'::jsonb)), '^INVITE_WRONG_CODE: ', 'a code with only dropped characters is just wrong');

-- Attempts are counted, and 10 lock the invite.
select is((select failed_attempts from public.invites where email = 'ok@t.local'), 3, 'wrong codes were counted (the three above)');
select pg_temp.hook('ok@t.local', '{"invite_code": "BBBB-BBBB"}'::jsonb) from generate_series(1, 8);
select is((select failed_attempts from public.invites where email = 'ok@t.local'), 10, 'ten wrong attempts in total');
select matches(pg_temp.msg(pg_temp.hook('ok@t.local', '{"invite_code": "K7MQ2WXA"}'::jsonb)), '^INVITE_LOCKED: ', 'then even the right code is locked out');
select is((select failed_attempts from public.invites where email = 'exp@t.local'), 0, 'attempts on other states are not counted');
select is((select failed_attempts from public.invites where email = 'ok@t.local'), 10, 'a locked invite stops counting');

-- Who may run it.
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), 'the Auth service can run the hook');
select ok(not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'), 'signed-in users cannot');
select ok(not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute'), 'anonymous callers cannot');
select ok(has_function_privilege('supabase_auth_admin', 'private.check_invite(text,text,boolean)', 'execute'), 'the Auth service can run the check it depends on');

select * from finish();
rollback;
