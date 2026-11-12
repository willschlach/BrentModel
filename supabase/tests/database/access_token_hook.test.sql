-- The custom access token hook (spec: role-access-control, "Only active accounts get a usable
-- session" and "The session token carries role and status").
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email, instance_id, aud, role)
select ('00000000-0000-0000-0000-0000000000' || c)::uuid, c || '@test.local',
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
from (values ('d1'), ('a1'), ('b1'), ('f1'), ('c1'), ('e1')) as t(c);

insert into public.profiles (id, email, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local', 'devops', 'active'),
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local', 'admin',  'active'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000f1', 'f1@test.local', 'member', 'disabled'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local', 'member', 'pending');
-- e1 has an auth user but no profile.

create function pg_temp.hook(uid text) returns jsonb language sql as $$
  select public.custom_access_token_hook(jsonb_build_object(
    'user_id', uid,
    'claims', jsonb_build_object('sub', uid, 'role', 'authenticated', 'aud', 'authenticated')));
$$;

-- Call the hook directly (the owner role reads profiles without RLS, as the Auth service will
-- through its own select policy; task 2.6 exercises the real Auth service path with a sign-in).
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000d1') -> 'claims' ->> 'user_role', 'devops', 'devops claim');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000d1') -> 'claims' ->> 'user_status', 'active', 'status claim');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000a1') -> 'claims' ->> 'user_role', 'admin', 'admin claim');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000b1') -> 'claims' ->> 'user_role', 'member', 'member claim');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000b1') -> 'claims' ->> 'role', 'authenticated', 'built-in role claim is untouched');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000b1') -> 'claims' ->> 'sub', '00000000-0000-0000-0000-0000000000b1', 'other claims are preserved');

select is(pg_temp.hook('00000000-0000-0000-0000-0000000000f1') #>> '{error,message}' like 'ACCOUNT_DISABLED:%', true, 'disabled is refused with its code');
select is((pg_temp.hook('00000000-0000-0000-0000-0000000000f1') #>> '{error,http_code}')::int, 403, 'refusal is a 403');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000c1') #>> '{error,message}' like 'ACCOUNT_PENDING:%', true, 'pending is refused with its code');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000e1') #>> '{error,message}' like 'ACCOUNT_NO_ROLE:%', true, 'no profile is refused with its code');
select is(pg_temp.hook('00000000-0000-0000-0000-0000000000c1') -> 'claims', null, 'a refusal carries no claims');

-- Only the Auth service may run the hook, and it may read profiles.
select ok(has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'),
          'the Auth service can run the hook');
select ok(not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute'),
          'signed-in users cannot run the hook');
select ok(not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute'),
          'anonymous callers cannot run the hook');
select is((select count(*)::int from pg_policies
           where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_auth_admin'),
          1, 'the Auth service has a select policy on profiles');

select * from finish();
rollback;
