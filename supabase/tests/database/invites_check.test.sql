-- Invite code generation, normalization, status precedence, and the check used by both sign-up
-- gates (spec: invite-management; design D2, D4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create function pg_temp.mk(
  p_email text, p_code text, p_attempts int default 0, p_expires interval default '24 hours',
  p_used boolean default false, p_revoked boolean default false, p_age interval default '1 minute'
) returns uuid language sql as $$
  insert into public.invites (email, role, code_hash, failed_attempts, expires_at, used_at, revoked_at, created_at)
  values (p_email, 'member', extensions.crypt(p_code, extensions.gen_salt('bf', 4)), p_attempts,
          now() + p_expires, case when p_used then now() end, case when p_revoked then now() end, now() - p_age)
  returning id
$$;

create function pg_temp.out(p_email text, p_code text, p_record boolean default false) returns text language sql as $$
  select outcome from private.check_invite(p_email, p_code, p_record)
$$;

-- ------------------------------------------------------------ generation
select is((select count(*)::int from generate_series(1, 200) g
           where private.generate_invite_code() ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
          200, 'codes are 8 characters from the alphabet without 0, O, 1, I, L');
select ok((select count(distinct private.generate_invite_code()) from generate_series(1, 200)) >= 199,
          'codes are generated independently');
select is(private.normalize_invite_code('k7mq-2wxa'), 'K7MQ2WXA', 'normalize: case and hyphen');
select is(private.normalize_invite_code(' K7MQ 2WXA '), 'K7MQ2WXA', 'normalize: spaces');
select is(private.normalize_invite_code('O0I1L'), '', 'normalize: confusable characters are dropped');
select is(private.format_invite_code('K7MQ2WXA'), 'K7MQ-2WXA', 'display format is XXXX-XXXX');
select is(private.invite_max_attempts(), 10, 'the lock is at 10 attempts');

-- ---------------------------------------------------------------- checks
select pg_temp.mk('ok@t.local', 'K7MQ2WXA');
select is(pg_temp.out('ok@t.local', 'K7MQ-2WXA'), 'ok', 'correct code is accepted');
select is(pg_temp.out('ok@t.local', ' k7mq2wxa '), 'ok', 'typed differently is accepted');
select is(pg_temp.out('  OK@T.Local ', 'K7MQ2WXA'), 'ok', 'email case and spaces are ignored');

select is(pg_temp.out('ok@t.local', 'AAAA-AAAA', true), 'wrong_code', 'wrong code is reported');
select is((select failed_attempts from public.invites where email = 'ok@t.local'), 1, 'a recorded wrong code counts');
select is(pg_temp.out('ok@t.local', 'AAAA-AAAA', false), 'wrong_code', 'wrong code again, not recorded');
select is((select failed_attempts from public.invites where email = 'ok@t.local'), 1, 'an unrecorded check changes nothing');
select is(pg_temp.out('ok@t.local', 'K7MQ2WXA', true), 'ok', 'a correct code is not an attempt');
select is((select failed_attempts from public.invites where email = 'ok@t.local'), 1, 'attempts unchanged by a correct code');

select is(pg_temp.out('nobody@t.local', 'K7MQ2WXA', true), 'no_invite', 'no invite for the email');
select is((select sum(failed_attempts)::int from public.invites), 1, 'no_invite does not count against any invite');

select pg_temp.mk('exp@t.local', 'K7MQ2WXA', p_expires => interval '-1 hour');
select is(pg_temp.out('exp@t.local', 'K7MQ2WXA'), 'expired', 'expired is reported even with the right code');
select pg_temp.mk('used@t.local', 'K7MQ2WXA', p_used => true, p_expires => interval '-1 hour');
select is(pg_temp.out('used@t.local', 'K7MQ2WXA'), 'used', 'used wins over expired');
select pg_temp.mk('rev@t.local', 'K7MQ2WXA', p_revoked => true);
select is(pg_temp.out('rev@t.local', 'K7MQ2WXA'), 'revoked', 'revoked is reported');

select pg_temp.mk('lock@t.local', 'K7MQ2WXA', p_attempts => 10);
select is(pg_temp.out('lock@t.local', 'K7MQ2WXA'), 'locked', 'locked rejects even the right code');

select pg_temp.mk('nine@t.local', 'K7MQ2WXA', p_attempts => 9);
select is(pg_temp.out('nine@t.local', 'ZZZZ-ZZZZ', true), 'wrong_code', 'the tenth wrong attempt is still a wrong code');
select is(private.invite_status((select i from public.invites i where email = 'nine@t.local')), 'locked', 'and now the invite is locked');
select is(pg_temp.out('nine@t.local', 'K7MQ2WXA'), 'locked', 'so the right code no longer works');

-- A disabled account's invite reads "disabled" in the list and "used" to a sign-up.
set local session_replication_role = replica;
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'dis@t.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
set local session_replication_role = origin;
insert into public.profiles (id, email, role, status) values ('00000000-0000-0000-0000-0000000000f1', 'dis@t.local', 'member', 'active');
select pg_temp.mk('dis@t.local', 'K7MQ2WXA', p_used => true);
update public.invites set used_by = '00000000-0000-0000-0000-0000000000f1' where email = 'dis@t.local';
select is(private.invite_status(i), 'used', 'used while the account is active') from public.invites i where email = 'dis@t.local';
update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000f1';
select is(private.invite_status(i), 'disabled', 'disabled when the account is disabled') from public.invites i where email = 'dis@t.local';
select is(pg_temp.out('dis@t.local', 'K7MQ2WXA'), 'disabled', 'the check reports it too');
select matches(private.invite_rejection_message('disabled'), '^INVITE_USED: ', 'a sign-up is told it is already used');
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000f1';
select is(private.invite_status(i), 'used', 'restoring the account makes it used again') from public.invites i where email = 'dis@t.local';

-- ------------------------------------------------- status precedence
select is(private.invite_status(i), 'used', 'used > revoked, locked, expired')
  from public.invites i where email = 'used@t.local';
select is(private.invite_status(row(gen_random_uuid(), 'x@t.local', 'member', 'h', null, now(), now() - interval '1 hour',
          null, null, now(), null, 12)::public.invites), 'revoked', 'revoked > locked, expired');
select is(private.invite_status(row(gen_random_uuid(), 'x@t.local', 'member', 'h', null, now(), now() - interval '1 hour',
          null, null, null, null, 12)::public.invites), 'locked', 'locked > expired');
select is(private.invite_status(i), 'active', 'active when none of the above')
  from public.invites i where email = 'ok@t.local';

select * from finish();
rollback;
