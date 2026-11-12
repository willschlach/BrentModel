-- Who can read which profiles (spec: role-access-control, "Visibility of accounts depends on role"
-- and "Database access requires a live active account").
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Fixtures: one devops, one admin, two members, one disabled member.
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'dev@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'adm@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'mem1@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'mem2@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'dis@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.profiles (id, email, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'dev@test.local',  'devops', 'active'),
  ('00000000-0000-0000-0000-0000000000a1', 'adm@test.local',  'admin',  'active'),
  ('00000000-0000-0000-0000-0000000000b1', 'mem1@test.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'mem2@test.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000c1', 'dis@test.local',  'member', 'disabled');

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


-- Member: only their own row.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.profiles), 1, 'member sees exactly one profile');
select is((select email from public.profiles), 'mem1@test.local', 'member sees their own profile');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'),
          0, 'member cannot read another profile');
select pg_temp.back_to_postgres();

-- Devops: everything.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.profiles), 5, 'devops sees every profile');
select pg_temp.back_to_postgres();

-- Admin: members and admins, not devops.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.profiles where role = 'devops'), 0, 'admin cannot read a devops profile');
select is((select count(*)::int from public.profiles where role = 'member'), 3, 'admin reads all members, including a disabled one');
select is((select count(*)::int from public.profiles where role = 'admin'), 1, 'admin reads admin profiles');
select pg_temp.back_to_postgres();

-- A disabled user holding a still-valid token reads nothing.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.profiles), 0, 'disabled user sees no rows, even their own');
select pg_temp.back_to_postgres();

-- A user who is demoted after their token was issued loses the old powers immediately.
update public.profiles set role = 'member' where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.profiles), 1, 'demoted admin is limited to their own row at once');
select pg_temp.back_to_postgres();

-- Anonymous callers have no access at all.
set local role anon;
select throws_ok('select count(*) from public.profiles', '42501', null, 'anonymous role is denied');
select pg_temp.back_to_postgres();

-- A table with RLS enabled and no matching policy returns nothing (profiles update by a member).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.back_to_postgres();
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'),
          'active', 'a member update matches no rows and changes nothing');

select * from finish();
rollback;
