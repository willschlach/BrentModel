-- Hierarchy and devops headcount rules (spec: role-access-control; design D4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Fixtures. Ids end in a short code: d=devops, a=admin, b=member, f=disabled member, c=pending member.
insert into auth.users (id, email, instance_id, aud, role)
select ('00000000-0000-0000-0000-0000000000' || c)::uuid, c || '@test.local',
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
from (values ('d1'), ('d2'), ('d3'), ('a1'), ('a2'), ('b1'), ('b2'), ('b3'), ('f1'), ('c1'), ('e1')) as t(c);

insert into public.profiles (id, email, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local', 'devops', 'active'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local', 'devops', 'disabled'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@test.local', 'devops', 'disabled'),
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local', 'admin',  'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local', 'admin',  'active'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000b3', 'b3@test.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000f1', 'f1@test.local', 'member', 'disabled'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local', 'member', 'pending');

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

-- Back to the privileged connection role, with the impersonated claims cleared as well
-- (claims set with set_config(..., true) outlive "reset role" within the transaction).
create function pg_temp.back_to_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;


-- ------------------------------------------------------------------ admin
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000b1'$$,
                'admin can disable a member');
select pg_temp.back_to_postgres();
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'disabled', 'member is now disabled');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b2'$$,
                'admin can promote a member');
select pg_temp.back_to_postgres();
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'), 'admin', 'member is now admin');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.profiles set role = 'member' where id = '00000000-0000-0000-0000-0000000000a2'$$,
                'admin demoting another admin runs without error');
select pg_temp.back_to_postgres();
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'admin', 'admin was NOT demoted');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000d1'$$,
                'admin disabling a devops runs without error');
select pg_temp.back_to_postgres();
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 'active', 'devops was NOT disabled');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.profiles set role = 'devops' where id = '00000000-0000-0000-0000-0000000000a1'$$,
                'admin changing own role runs without error');
select pg_temp.back_to_postgres();
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'admin', 'admin did NOT become devops');

-- ----------------------------------------------------------------- member
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');
select lives_ok($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b3'$$,
                'member self-promotion runs without error');
select pg_temp.back_to_postgres();
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b3'), 'member', 'member did NOT become admin');

-- ----------------------------------------------------------------- devops
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$update public.profiles set role = 'member' where id = '00000000-0000-0000-0000-0000000000a2'$$,
                'devops can demote an admin');
select lives_ok($$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000f1'$$,
                'devops can restore a disabled member');
select pg_temp.back_to_postgres();
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'member', 'admin is now a member');
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'active', 'member is restored');

-- ---------------------------------------------------- admin approves pending
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000c1'$$,
                'admin can approve a pending member');
select pg_temp.back_to_postgres();
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'active', 'pending member is active');

-- ------------------------------------------------------ rejected by trigger
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$update public.profiles set status = 'pending' where id = '00000000-0000-0000-0000-0000000000b3'$$,
                 '42501', null, 'admin cannot set a member back to pending');
select throws_ok($$update public.profiles set role = 'devops' where id = '00000000-0000-0000-0000-0000000000b3'$$,
                 '42501', null, 'admin cannot promote a member to devops');
select pg_temp.back_to_postgres();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000d1'$$,
                 '42501', null, 'nobody can change their own status, devops included');
select pg_temp.back_to_postgres();

-- --------------------------------------------------------------- headcount
-- Only d1 is an active devops at this point.
select throws_ok($$update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000d1'$$,
                 '23514', null, 'the last active devops cannot be disabled');
select throws_ok($$update public.profiles set role = 'member' where id = '00000000-0000-0000-0000-0000000000d1'$$,
                 '23514', null, 'the last active devops cannot be demoted');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'$$,
                 '23514', null, 'the last active devops cannot be deleted');

select lives_ok($$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000d2'$$,
                'a second devops can be restored');
select is((select count(*)::int from public.profiles where role = 'devops' and status = 'active'), 2, 'two active devops');
select throws_ok($$update public.profiles set role = 'devops' where id = '00000000-0000-0000-0000-0000000000a1'$$,
                 '23514', null, 'a third active devops is refused');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000d2'$$,
                'one devops can remove the other');
select pg_temp.back_to_postgres();
select is((select count(*)::int from public.profiles where role = 'devops' and status = 'active'), 1, 'one active devops remains');

select lives_ok($$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000d2'$$,
                'devops restored again to reach the cap');
select throws_ok($$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000d3'$$,
                 '23514', null, 'restoring a devops at the cap is refused');
select throws_ok($$insert into public.profiles (id, email, role, status) values ('00000000-0000-0000-0000-0000000000e1', 'e1@test.local', 'devops', 'active')$$,
                 '23514', null, 'a privileged insert cannot exceed the cap either');

select * from finish();
rollback;
