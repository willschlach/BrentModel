-- Gate 2: the trigger on auth.users (spec: account-signup, role-access-control; design D6).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.mk(p_email text, p_code text, p_role public.app_role default 'member', p_attempts int default 0,
                           p_expires interval default '24 hours', p_used boolean default false, p_revoked boolean default false)
returns uuid language sql as $$
  insert into public.invites (email, role, code_hash, failed_attempts, expires_at, used_at, revoked_at, created_at)
  values (p_email, p_role, extensions.crypt(p_code, extensions.gen_salt('bf', 4)), p_attempts,
          now() + p_expires, case when p_used then now() end, case when p_revoked then now() end, now() - interval '1 minute')
  returning id
$$;
create function pg_temp.new_user(p_id text, p_email text, p_meta jsonb default '{}'::jsonb) returns void language sql as $$
  insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
  values (('00000000-0000-0000-0000-0000000000' || p_id)::uuid, p_email, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_meta)
$$;
create function pg_temp.prof(p_id text) returns public.profiles language sql as $$
  select p from public.profiles p where p.id = ('00000000-0000-0000-0000-0000000000' || p_id)::uuid
$$;

-- ------------------------------------------------------------ no code
select pg_temp.new_user('01', 'Pending.One@T.local');
select is((pg_temp.prof('01')).status::text || ' ' || (pg_temp.prof('01')).role::text, 'pending member', 'no code: pending member');
select is((pg_temp.prof('01')).email, 'pending.one@t.local', 'the profile email is lower case');
select pg_temp.new_user('02', 'pending2@t.local', '{"invite_code": "   "}');
select is((pg_temp.prof('02')).status::text, 'pending', 'a blank code is no code');
select pg_temp.new_user('03', 'pending3@t.local', '{"role": "devops", "status": "active", "user_role": "devops"}');
select is((pg_temp.prof('03')).status::text || ' ' || (pg_temp.prof('03')).role::text, 'pending member', 'asking for devops / active is ignored');

-- ---------------------------------------------------------- valid code
select pg_temp.mk('in1@t.local', 'K7MQ2WXA');
select pg_temp.new_user('11', 'IN1@t.local', '{"invite_code": "k7mq-2wxa", "other": "kept"}');
select is((pg_temp.prof('11')).status::text || ' ' || (pg_temp.prof('11')).role::text, 'active member', 'valid member invite: active member');
select is((select used_by from public.invites where email = 'in1@t.local'), '00000000-0000-0000-0000-000000000011'::uuid, 'the invite records who used it');
select is(private.invite_status((select i from public.invites i where email = 'in1@t.local')), 'used', 'and is now used');
select ok(not (select raw_user_meta_data ? 'invite_code' from auth.users where email = 'IN1@t.local'), 'the code is scrubbed from stored data');
select is((select raw_user_meta_data ->> 'other' from auth.users where email = 'IN1@t.local'), 'kept', 'other metadata is left alone');
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"invite_code": "AGAIN-111", "sub": "x"}' where email = 'IN1@t.local';
select ok(not (select raw_user_meta_data ? 'invite_code' from auth.users where email = 'IN1@t.local'), 'a later rewrite of the stored data cannot put the code back');

select pg_temp.mk('in2@t.local', 'K7MQ2WXA', 'admin');
select pg_temp.new_user('12', 'in2@t.local', '{"invite_code": "K7MQ2WXA", "role": "devops"}');
select is((pg_temp.prof('12')).role::text, 'admin', 'valid admin invite: admin, and a requested devops role is ignored');

-- --------------------------------------------------------- rejections
select throws_like($$select pg_temp.new_user('21', 'in1@t.local', '{"invite_code": "K7MQ2WXA"}')$$, 'INVITE_USED%', 'the same code cannot be used twice');
select pg_temp.mk('in3@t.local', 'K7MQ2WXA');
select throws_like($$select pg_temp.new_user('22', 'in3@t.local', '{"invite_code": "AAAA2222"}')$$, 'INVITE_WRONG_CODE%', 'a wrong code is rejected');
select is((select count(*)::int from auth.users where email = 'in3@t.local'), 0, 'and creates no user');
select is((select count(*)::int from public.profiles where email = 'in3@t.local'), 0, 'and no profile');
select is(private.invite_status((select i from public.invites i where email = 'in3@t.local')), 'active', 'and does not use up the invite');
select throws_like($$select pg_temp.new_user('23', 'nobody@t.local', '{"invite_code": "K7MQ2WXA"}')$$, 'INVITE_NO_INVITE%', 'no invite for the email');
select throws_like($$select pg_temp.new_user('24', 'other@t.local', '{"invite_code": "K7MQ2WXA"}')$$, 'INVITE_NO_INVITE%', 'a valid code with a different email is rejected');

select pg_temp.mk('e@t.local', 'K7MQ2WXA', p_expires => interval '-1 hour');
select throws_like($$select pg_temp.new_user('25', 'e@t.local', '{"invite_code": "K7MQ2WXA"}')$$, 'INVITE_EXPIRED%', 'expired');
select pg_temp.mk('r@t.local', 'K7MQ2WXA', p_revoked => true);
select throws_like($$select pg_temp.new_user('26', 'r@t.local', '{"invite_code": "K7MQ2WXA"}')$$, 'INVITE_REVOKED%', 'revoked');
select pg_temp.mk('l@t.local', 'K7MQ2WXA', p_attempts => 10);
select throws_like($$select pg_temp.new_user('27', 'l@t.local', '{"invite_code": "K7MQ2WXA"}')$$, 'INVITE_LOCKED%', 'locked');

-- A failure after the code was checked leaves the invite usable.
select pg_temp.mk('boom@t.local', 'K7MQ2WXA');
alter table public.profiles add constraint tmp_no_boom check (email <> 'boom@t.local');
select throws_ok($$select pg_temp.new_user('28', 'boom@t.local', '{"invite_code": "K7MQ2WXA"}')$$, '23514', null, 'a failure while creating the profile rolls everything back');
select is(private.invite_status((select i from public.invites i where email = 'boom@t.local')), 'active', 'so the invite is still usable');
select is((select count(*)::int from auth.users where email = 'boom@t.local'), 0, 'and no user remains');

select * from finish();
rollback;
