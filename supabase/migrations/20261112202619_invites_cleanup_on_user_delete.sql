-- Removing an account removes the invites addressed to its email.
--
-- Invites are looked up by email, so once the account is gone an invite for that email is stale:
-- a used one would sit in the Invites list as history for nobody, and an unused one would still be
-- usable. Deleting the account clears them. Disabling an account leaves them alone.
-- Invites the removed person CREATED are not touched; they stay, with no creator shown.
-- Runs for every kind of delete (the removal script, SQL, the dashboard, a future approvals screen).

create function private.delete_invites_for_removed_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.invites
  where email = lower(btrim(coalesce(old.email, '')));
  return old;
end;
$$;

revoke all on function private.delete_invites_for_removed_user() from public, anon, authenticated;

create trigger delete_invites_on_user_delete
  after delete on auth.users
  for each row execute function private.delete_invites_for_removed_user();
