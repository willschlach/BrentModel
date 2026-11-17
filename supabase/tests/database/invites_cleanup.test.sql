-- Removing an account removes the invites addressed to its email (spec: invite-management).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- The sign-up trigger would create profiles for these; the fixtures insert their own.
set local session_replication_role = replica;
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'dev@t.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'Gone@T.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'stays@t.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'maker@t.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
set local session_replication_role = origin;
insert into public.profiles (id, email, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'dev@t.local',   'devops', 'active'),
  ('00000000-0000-0000-0000-0000000000b1', 'gone@t.local',  'member', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'stays@t.local', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000b3', 'maker@t.local', 'admin',  'active');

-- gone@: the invite that created the account (one invite per email).
insert into public.invites (email, role, code_hash, created_by, used_at, used_by) values
  ('gone@t.local', 'member', 'h', '00000000-0000-0000-0000-0000000000d1', now(), '00000000-0000-0000-0000-0000000000b1');
-- stays@: untouched by anyone else's removal.
insert into public.invites (email, role, code_hash, created_by, used_at, used_by) values
  ('stays@t.local', 'member', 'h', '00000000-0000-0000-0000-0000000000d1', now(), '00000000-0000-0000-0000-0000000000b2');
-- Invites made BY maker@ for other people.
insert into public.invites (email, role, code_hash, created_by) values
  ('someone@t.local', 'member', 'h', '00000000-0000-0000-0000-0000000000b3');

select is((select count(*)::int from public.invites where email = 'gone@t.local'), 1, 'before: the person has an invite on record');

-- Disabling is not removing.
update public.profiles set status = 'disabled' where id = '00000000-0000-0000-0000-0000000000b1';
select is((select count(*)::int from public.invites where email = 'gone@t.local'), 1, 'disabling the account keeps its invite');
select is(private.invite_status((select i from public.invites i where email = 'gone@t.local')), 'disabled', 'and its status becomes disabled');

-- Removing is.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
select is((select count(*)::int from public.invites where email = 'gone@t.local'), 0, 'deleting the account deletes its invite, whatever its status');
select is((select count(*)::int from public.invite_list where email = 'gone@t.local'), 0, 'and they are gone from the invite list');
select is((select count(*)::int from public.profiles where email = 'gone@t.local'), 0, 'the profile went with the account');
select is((select count(*)::int from public.invites where email = 'stays@t.local'), 1, 'other people''s invites are untouched');

-- Removing the creator keeps what they created.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b3';
select is((select count(*)::int from public.invites where email = 'someone@t.local'), 1, 'invites a removed person created are kept');
select is((select created_by from public.invites where email = 'someone@t.local'), null, 'with no creator shown');
select is((select count(*)::int from public.invites where email = 'stays@t.local'), 1, 'and still nothing else changed');

select * from finish();
rollback;
