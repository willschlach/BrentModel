-- Live role lookup and the row level security policies for profiles.
-- See design.md D3. Policies read the caller's CURRENT profile, not the token claims,
-- so a disabled or demoted user loses access immediately.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, supabase_auth_admin;

-- Role of the calling user, or null when the caller is not an active account.
-- security definer so it can read profiles without recursing into profiles' own policies.
create function private.actor_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
$$;

revoke all on function private.actor_role() from public, anon;
grant execute on function private.actor_role() to authenticated;

-- ---------------------------------------------------------------- read access

-- Everyone active can read their own row.
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select private.actor_role()) is not null);

-- Devops can read every profile.
create policy profiles_select_devops
  on public.profiles for select to authenticated
  using ((select private.actor_role()) = 'devops');

-- Admins can read members and admins, never devops.
create policy profiles_select_admin
  on public.profiles for select to authenticated
  using ((select private.actor_role()) = 'admin' and role in ('member', 'admin'));

-- The Auth service needs to read profiles when it builds a token.
create policy profiles_select_auth_admin
  on public.profiles for select to supabase_auth_admin
  using (true);

-- --------------------------------------------------------------- write access
-- Policies decide which rows a caller may touch. The rules trigger (next migration)
-- decides exactly which changes are allowed, because policies cannot compare old and new.

-- Devops can update any profile.
create policy profiles_update_devops
  on public.profiles for update to authenticated
  using ((select private.actor_role()) = 'devops')
  with check ((select private.actor_role()) = 'devops');

-- Admins can update members, and can leave the row as a member or admin (promotion).
create policy profiles_update_admin
  on public.profiles for update to authenticated
  using ((select private.actor_role()) = 'admin' and role = 'member')
  with check ((select private.actor_role()) = 'admin' and role in ('member', 'admin'));

-- No policy exists for members, so their updates match no rows.
-- No insert or delete policy exists, and no insert or delete grant was given to clients.
