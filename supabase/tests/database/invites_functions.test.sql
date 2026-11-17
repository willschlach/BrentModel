-- create_invite, revoke_invite, regenerate_invite, and who can see or write invites
-- (spec: invite-management; design D3).
begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

-- Fixtures. The sign-up trigger (later migration) is suppressed for the auth.users inserts.
set local session_replication_role = replica;
insert into auth.users (id, email, instance_id, aud, role)
select ('00000000-0000-0000-0000-0000000000' || c)::uuid, e, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
from (values ('d1', 'dev@t.local'), ('d2', 'dev2@t.local'), ('a1', 'adm@t.local'), ('a2', 'adm2@t.local'),
             ('b1', 'mem@t.local'), ('e1', 'exists@t.local'), ('f1', 'dis@t.local')) as t(c, e);
set local session_replication_role = origin;
insert into public.profiles (id, email, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'dev@t.local',    'devops', 'active'),
  ('00000000-0000-0000-0000-0000000000d2', 'dev2@t.local',   'devops', 'disabled'),
  ('00000000-0000-0000-0000-0000000000a1', 'adm@t.local',    'admin',  'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'adm2@t.local',   'admin',  'active'),
  ('00000000-0000-0000-0000-0000000000b1', 'mem@t.local',    'member', 'active'),
  ('00000000-0000-0000-0000-0000000000e1', 'exists@t.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000f1', 'dis@t.local',    'member', 'disabled');

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.back_to_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
-- Create an invite as a given user and keep the code and id in settings (t.code_<k>, t.id_<k>).
create function pg_temp.invite_as(uid uuid, k text, p_email text, p_role public.app_role) returns void language plpgsql as $$
declare r record;
begin
  perform pg_temp.act_as(uid);
  select * into r from public.create_invite(p_email, p_role);
  perform pg_temp.back_to_postgres();
  perform set_config('t.code_' || k, r.new_code, true);
  perform set_config('t.id_' || k, r.new_invite_id::text, true);
end $$;
create function pg_temp.st(k text) returns text language sql as $$
  select private.invite_status(i) from public.invites i where i.id = current_setting('t.id_' || k)::uuid
$$;

-- ----------------------------------------------------------------- create
select pg_temp.invite_as('00000000-0000-0000-0000-0000000000d1', 'one', ' Invitee1@T.local ', 'member');
select matches(current_setting('t.code_one'), '^[2-9A-Z]{4}-[2-9A-Z]{4}$', 'the creator gets the code as XXXX-XXXX');
select is((select email from public.invites where id = current_setting('t.id_one')::uuid), 'invitee1@t.local', 'email is stored trimmed and lower case');
select is((select role::text from public.invites where id = current_setting('t.id_one')::uuid), 'member', 'role is stored');
select is((select created_by from public.invites where id = current_setting('t.id_one')::uuid), '00000000-0000-0000-0000-0000000000d1'::uuid, 'creator is recorded');
select is(pg_temp.st('one'), 'active', 'a new invite is active');
select is((select outcome from private.check_invite('invitee1@t.local', current_setting('t.code_one'))), 'ok', 'the stored hash matches the code');
select matches((select code_hash from public.invites where id = current_setting('t.id_one')::uuid), '^\$2[aby]\$', 'only a bcrypt hash is stored');
select ok((select expires_at - created_at from public.invites where id = current_setting('t.id_one')::uuid) = interval '24 hours', 'the invite lasts 24 hours');

select pg_temp.invite_as('00000000-0000-0000-0000-0000000000a1', 'adm', 'newadmin@t.local', 'admin');
select is((select role::text from public.invites where id = current_setting('t.id_adm')::uuid), 'admin', 'an admin can create an admin invite');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select * from public.create_invite('x@t.local', 'member')$$, '42501', null, 'a member cannot create invites');
select pg_temp.back_to_postgres();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select * from public.create_invite('x@t.local', 'devops')$$, '22023', null, 'an invite for the devops role is refused');
select throws_like($$select * from public.create_invite('not-an-email', 'member')$$, 'INVITE_BAD_EMAIL%', 'a bad email is refused');
select throws_like($$select * from public.create_invite('exists@t.local', 'member')$$, 'INVITE_ACCOUNT_EXISTS%', 'an email with an account is refused');
select throws_like($$select * from public.create_invite('DIS@t.local', 'member')$$, 'INVITE_ACCOUNT_DISABLED%', 'a disabled account says to restore instead');
select pg_temp.back_to_postgres();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d2');
select throws_ok($$select * from public.create_invite('x@t.local', 'member')$$, '42501', null, 'a disabled devops with a valid token is refused');
select pg_temp.back_to_postgres();
set local role anon;
select throws_ok($$select * from public.create_invite('x@t.local', 'member')$$, '42501', null, 'anonymous callers are refused');
select pg_temp.back_to_postgres();
select is((select count(*)::int from public.invites where email = 'x@t.local'), 0, 'no refused request left an invite behind');

-- A second invite for the same email reuses the invite: one row, new code.
select pg_temp.invite_as('00000000-0000-0000-0000-0000000000d1', 'two', 'invitee1@t.local', 'admin');
select is((select count(*)::int from public.invites where email = 'invitee1@t.local'), 1, 'the email still has exactly one invite');
select is(current_setting('t.id_two'), current_setting('t.id_one'), 'it is the same invite');
select is(pg_temp.st('two'), 'active', 'and active');
select is((select role::text from public.invites where id = current_setting('t.id_two')::uuid), 'admin', 'with the role just chosen');
select is((select outcome from private.check_invite('invitee1@t.local', current_setting('t.code_one'))), 'wrong_code', 'the old code no longer works');
select is((select outcome from private.check_invite('invitee1@t.local', current_setting('t.code_two'))), 'ok', 'the new code works');

-- Revoke, then invite again: the same invite comes back to life with a new code.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok(format($$select public.revoke_invite(%L)$$, current_setting('t.id_two')), 'revoke it');
select pg_temp.back_to_postgres();
select is(pg_temp.st('two'), 'revoked', 'it is revoked');
select pg_temp.invite_as('00000000-0000-0000-0000-0000000000d1', 'three', 'invitee1@t.local', 'member');
select is((select count(*)::int from public.invites where email = 'invitee1@t.local'), 1, 'inviting again leaves one invite');
select is(pg_temp.st('three'), 'active', 'which is active, not revoked');
select is((select revoked_at from public.invites where id = current_setting('t.id_three')::uuid), null, 'the revocation is cleared');
select is((select outcome from private.check_invite('invitee1@t.local', current_setting('t.code_three'))), 'ok', 'and the new code signs up');
select is((select outcome from private.check_invite('invitee1@t.local', current_setting('t.code_two'))), 'wrong_code', 'while the code from before the revoke does not');

-- ----------------------------------------------------------------- revoke
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok(format($$select public.revoke_invite(%L)$$, current_setting('t.id_adm')), 'devops can revoke an admin-created invite');
select pg_temp.back_to_postgres();
select is(pg_temp.st('adm'), 'revoked', 'it is revoked');
select is((select revoked_by from public.invites where id = current_setting('t.id_adm')::uuid), '00000000-0000-0000-0000-0000000000d1'::uuid, 'who revoked it is recorded');

select pg_temp.invite_as('00000000-0000-0000-0000-0000000000a1', 'own', 'own@t.local', 'member');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$select public.revoke_invite(%L)$$, current_setting('t.id_own')), 'an admin can revoke their own invite');
select pg_temp.back_to_postgres();
select is(pg_temp.st('own'), 'revoked', 'their invite is revoked');

select pg_temp.invite_as('00000000-0000-0000-0000-0000000000d1', 'other', 'other@t.local', 'member');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like(format($$select public.revoke_invite(%L)$$, current_setting('t.id_other')), 'INVITE_FORBIDDEN%', 'an admin cannot revoke someone else''s invite');
select pg_temp.back_to_postgres();
select is(pg_temp.st('other'), 'active', 'and it is unchanged');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(format($$select public.revoke_invite(%L)$$, current_setting('t.id_other')), '42501', null, 'a member cannot revoke');
select pg_temp.back_to_postgres();

select pg_temp.invite_as('00000000-0000-0000-0000-0000000000d1', 'usedx', 'usedx@t.local', 'member');
update public.invites set used_at = now() where id = current_setting('t.id_usedx')::uuid;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_like(format($$select public.revoke_invite(%L)$$, current_setting('t.id_usedx')), 'INVITE_ALREADY_USED%', 'a used invite cannot be revoked');
select throws_like(format($$select public.revoke_invite(%L)$$, current_setting('t.id_adm')), 'INVITE_ALREADY_REVOKED%', 'a revoked invite cannot be revoked again');
select pg_temp.back_to_postgres();
select is(pg_temp.st('usedx'), 'used', 'the used invite stays used');

-- ------------------------------------------------------------- regenerate
select pg_temp.invite_as('00000000-0000-0000-0000-0000000000d1', 'lock', 'lockme@t.local', 'admin');
update public.invites set failed_attempts = 10 where id = current_setting('t.id_lock')::uuid;
select is(pg_temp.st('lock'), 'locked', 'the invite is locked');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select set_config('t.id_lock2', r.new_invite_id::text, true), set_config('t.code_lock2', r.new_code, true)
  from public.regenerate_invite(current_setting('t.id_lock')::uuid) r;
select pg_temp.back_to_postgres();
select is(current_setting('t.id_lock2'), current_setting('t.id_lock'), 'regenerating keeps the same invite');
select is((select failed_attempts from public.invites where id = current_setting('t.id_lock')::uuid), 0, 'with the attempt count reset');
select is(pg_temp.st('lock2'), 'active', 'and it is active again');
select is((select role::text || ' ' || email from public.invites where id = current_setting('t.id_lock2')::uuid), 'admin lockme@t.local', 'same email and role');
select is((select outcome from private.check_invite('lockme@t.local', current_setting('t.code_lock2'))), 'ok', 'the new code works');
select is((select outcome from private.check_invite('lockme@t.local', current_setting('t.code_lock'))), 'wrong_code', 'the old code does not');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_like(format($$select * from public.regenerate_invite(%L)$$, current_setting('t.id_usedx')), 'INVITE_ALREADY_USED%', 'a used invite cannot be regenerated');
select pg_temp.back_to_postgres();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like(format($$select * from public.regenerate_invite(%L)$$, current_setting('t.id_other')), 'INVITE_FORBIDDEN%', 'an admin cannot regenerate someone else''s invite');
select pg_temp.back_to_postgres();

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok(format($$select public.revoke_invite(%L)$$, current_setting('t.id_lock2')), 'revoke the regenerated invite');
select set_config('t.code_lock3', r.new_code, true) from public.regenerate_invite(current_setting('t.id_lock2')::uuid) r;
select pg_temp.back_to_postgres();
select is(pg_temp.st('lock'), 'active', 'regenerating a revoked invite makes it active again');
select is((select outcome from private.check_invite('lockme@t.local', current_setting('t.code_lock3'))), 'ok', 'with a working code');

-- ------------------------------------------------------------ changing the role
select pg_temp.invite_as('00000000-0000-0000-0000-0000000000d1', 'role', 'rolechange@t.local', 'member');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok(format($$select public.update_invite_role(%L, 'admin')$$, current_setting('t.id_role')), 'devops can change an active invite to admin');
select pg_temp.back_to_postgres();
select is((select role::text from public.invites where id = current_setting('t.id_role')::uuid), 'admin', 'the role changed');
select is((select outcome from private.check_invite('rolechange@t.local', current_setting('t.code_role'))), 'ok', 'the same code still works');
select is(pg_temp.st('role'), 'active', 'and it is still active');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(format($$select public.update_invite_role(%L, 'devops')$$, current_setting('t.id_role')), '22023', null, 'the role cannot be devops');
select pg_temp.back_to_postgres();
select is((select role::text from public.invites where id = current_setting('t.id_role')::uuid), 'admin', 'and it is unchanged');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_like(format($$select public.update_invite_role(%L, 'member')$$, current_setting('t.id_usedx')), 'INVITE_ALREADY_USED%', 'a used invite cannot be changed');
select throws_like(format($$select public.update_invite_role(%L, 'member')$$, current_setting('t.id_adm')), 'INVITE_NOT_EDITABLE%', 'a revoked invite cannot be changed');
select pg_temp.back_to_postgres();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like(format($$select public.update_invite_role(%L, 'member')$$, current_setting('t.id_role')), 'INVITE_FORBIDDEN%', 'an admin cannot change someone else''s invite');
select pg_temp.back_to_postgres();
select pg_temp.invite_as('00000000-0000-0000-0000-0000000000a1', 'own2', 'own2@t.local', 'member');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$select public.update_invite_role(%L, 'admin')$$, current_setting('t.id_own2')), 'an admin can change their own invite');
select pg_temp.back_to_postgres();
select is((select role::text from public.invites where id = current_setting('t.id_own2')::uuid), 'admin', 'and it changed');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(format($$select public.update_invite_role(%L, 'member')$$, current_setting('t.id_role')), '42501', null, 'a member cannot');
select pg_temp.back_to_postgres();

-- ------------------------------------------------------------- visibility
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.invite_list), (select count(*)::int from public.invites), 'devops sees every invite');
select pg_temp.back_to_postgres();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.invite_list where created_by <> '00000000-0000-0000-0000-0000000000a1'), 0, 'an admin sees only their own invites');
select ok((select count(*)::int from public.invite_list) >= 2, 'and does see those');
select pg_temp.back_to_postgres();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.invite_list), 0, 'a member sees none');
select pg_temp.back_to_postgres();
set local role anon;
select throws_ok($$select count(*) from public.invite_list$$, '42501', null, 'anonymous callers cannot read invites');
select pg_temp.back_to_postgres();
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'invite_list' and (column_name ilike '%hash%' or column_name ilike '%code%')),
          0, 'the invite list has no code or hash column');

-- ---------------------------------------------------------- direct writes
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$insert into public.invites (email, role, code_hash) values ('direct@t.local', 'member', 'x')$$, '42501', null, 'no direct insert, even for devops');
select throws_ok($$update public.invites set revoked_at = now()$$, '42501', null, 'no direct update');
select throws_ok($$delete from public.invites$$, '42501', null, 'no direct delete');
select pg_temp.back_to_postgres();

select * from finish();
rollback;
