-- Approving and rejecting pending requests (spec: role-access-control; account-management design D1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- The sign-up trigger would create profiles for these; the fixtures insert their own.
set local session_replication_role = replica;
insert into auth.users (id, email, instance_id, aud, role)
select ('00000000-0000-0000-0000-0000000000' || c)::uuid, c || '@t.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
from (values ('d1'), ('d2'), ('a1'), ('a2'), ('b1'), ('b2'), ('c1'), ('c2'), ('c3'), ('c4'), ('c5'), ('f1'), ('e1')) as t(c);
set local session_replication_role = origin;
insert into public.profiles (id, email, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@t.local', 'devops', 'active'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@t.local', 'devops', 'active'),
  ('00000000-0000-0000-0000-0000000000a1', 'a1@t.local', 'admin',  'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@t.local', 'admin',  'disabled'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@t.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@t.local', 'member', 'disabled'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@t.local', 'member', 'pending'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@t.local', 'member', 'pending'),
  ('00000000-0000-0000-0000-0000000000c3', 'c3@t.local', 'member', 'pending'),
  ('00000000-0000-0000-0000-0000000000c4', 'c4@t.local', 'member', 'pending'),
  ('00000000-0000-0000-0000-0000000000c5', 'c5@t.local', 'member', 'pending'),
  ('00000000-0000-0000-0000-0000000000e1', 'e1@t.local', 'admin',  'pending');

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
create function pg_temp.gone(p_id text) returns boolean language sql as $$
  select not exists (select 1 from auth.users where id = ('00000000-0000-0000-0000-0000000000' || p_id)::uuid)
     and not exists (select 1 from public.profiles where id = ('00000000-0000-0000-0000-0000000000' || p_id)::uuid)
$$;
create function pg_temp.exists_(p_id text) returns boolean language sql as $$
  select exists (select 1 from auth.users where id = ('00000000-0000-0000-0000-0000000000' || p_id)::uuid)
     and exists (select 1 from public.profiles where id = ('00000000-0000-0000-0000-0000000000' || p_id)::uuid)
$$;

-- ------------------------------------------------------------- who may reject
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000c1')$$, 'devops can reject a pending request');
select pg_temp.back_to_postgres();
select ok(pg_temp.gone('c1'), 'the auth user and the profile are both gone');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000c2')$$, 'an admin can reject a pending request');
select pg_temp.back_to_postgres();
select ok(pg_temp.gone('c2'), 'and it is gone');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000c3')$$, '42501', null, 'a member cannot reject');
select pg_temp.back_to_postgres();
select ok(pg_temp.exists_('c3'), 'and the request is untouched');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000c3')$$, '42501', null, 'a disabled admin with a still-valid token cannot reject');
select pg_temp.back_to_postgres();
select ok(pg_temp.exists_('c3'), 'and the request is untouched');

set local role anon;
select throws_ok($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000c3')$$, '42501', null, 'anonymous callers cannot reject');
select pg_temp.back_to_postgres();

-- ------------------------------------------------------ only pending accounts
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_like($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000b1')$$, 'PEOPLE_NOT_PENDING%', 'an active member cannot be rejected');
select throws_like($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000b2')$$, 'PEOPLE_NOT_PENDING%', 'a disabled member cannot be rejected');
select throws_like($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000d2')$$, 'PEOPLE_NOT_PENDING%', 'another devops cannot be rejected');
select throws_like($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000ff')$$, 'PEOPLE_NOT_FOUND%', 'an unknown id is reported');
select pg_temp.back_to_postgres();
select ok(pg_temp.exists_('b1') and pg_temp.exists_('b2') and pg_temp.exists_('d2'), 'none of them were touched');

-- An admin acts on members only, even for a pending account.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000e1')$$, '42501', null, 'an admin cannot reject a pending non-member');
select pg_temp.back_to_postgres();
select ok(pg_temp.exists_('e1'), 'and it is untouched');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000e1')$$, 'but devops can');
select pg_temp.back_to_postgres();

-- ------------------------------------------- nothing else can delete accounts
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'$$, '42501', null, 'a signed-in user cannot delete a profile');
select set_config('app.rejecting_user', '00000000-0000-0000-0000-0000000000c3', true);
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'$$, '42501', null, 'even with the setting forged');
select throws_ok($$delete from auth.users where id = '00000000-0000-0000-0000-0000000000c3'$$, '42501', null, 'and cannot delete an authentication user');
select pg_temp.back_to_postgres();
select ok(pg_temp.exists_('c3'), 'the account is still there');

-- The exception inside the rules themselves. The owner role CAN delete here, so only the trigger
-- stands in the way. Act as a signed-in admin (claims set, role not switched) with a forged setting.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.rejecting_user', '00000000-0000-0000-0000-0000000000b1', true);
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'$$, '42501', null, 'a vouched delete of an ACTIVE row is still refused');
select set_config('app.rejecting_user', '00000000-0000-0000-0000-0000000000c5', true);
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000c4'$$, '42501', null, 'a vouch for one account does not cover another');
select lives_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000c5'$$, 'the vouched pending row itself can be deleted');
select set_config('app.rejecting_user', '', true);
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000c4'$$, '42501', null, 'and once the setting is cleared nothing can be');
select pg_temp.back_to_postgres();
select ok(pg_temp.exists_('c4') and pg_temp.exists_('b1'), 'the other rows are still there');
-- put c5 back for the counts below
insert into public.profiles (id, email, role, status) values ('00000000-0000-0000-0000-0000000000c5', 'c5@t.local', 'member', 'pending');

-- ------------------------------------------------------------------ approving
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000c3' and status = 'pending'$$, 'an admin can approve a pending member');
select pg_temp.back_to_postgres();
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'), 'active', 'who is now active');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like($$select public.reject_pending_request('00000000-0000-0000-0000-0000000000c3')$$, 'PEOPLE_NOT_PENDING%', 'a stale reject after an approval is refused');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000c3' and status = 'pending'), 0, 'a stale approve (conditional on pending) now matches nothing');
select pg_temp.back_to_postgres();
select is((select count(*)::int from public.profiles where status = 'pending'), 2, 'only c4 and c5 are still pending');

select * from finish();
rollback;
