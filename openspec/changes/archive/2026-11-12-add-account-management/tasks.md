# Tasks

## 1. Database: rejecting a pending request
- [x] 1.1 Spike on the local stack: confirm a `security definer` function owned by `postgres` can delete from `auth.users`, that the profile rules trigger can be made to allow that one delete through a transaction-local setting, and that a head-only exact count of `profiles` under RLS returns the right numbers for a devops user and an admin. Record the result under Decision D1 in `design.md`
- [x] 1.2 Add the migration: `public.reject_pending_request` and the replaced `private.enforce_profile_rules` with the narrow exception (Decision D1). Verify with pgTAP tests: devops and admin can reject a pending account and both the auth user and profile are gone; an active, disabled, or devops account is refused and unchanged; a member and a disabled-with-valid-token admin are refused; an unknown id is reported; anonymous callers are refused; a direct delete by a signed-in user is refused even with the setting forged; approving (pending to active) works for an admin; and all earlier database tests still pass

## 2. Frontend foundations
- [x] 2.1 Add `src/lib/peopleRules.ts` with `allowedActions` (Decision D3) and vitest cases for every row of the table, including self, pending, and devops rows. Verify with `npm run test -- --run`
- [x] 2.2 Add `src/lib/peopleErrors.ts` mapping database errors to messages (the devops limits in the database's wording, permission errors, stale rows, unknown errors) with vitest cases. Verify with `npm run test -- --run`
- [x] 2.3 Change `RequireRole` to take `roles: AppRole[]` and update its use. Verify with `npm run typecheck` and that a member is still redirected from the page

## 3. Header link and pending count
- [x] 3.1 Add `PendingCountProvider` and its hook (Decision D5): count on mount, on focus, about every 60 seconds while visible, and on `refresh()`, only for devops and admin. Verify with `npm run typecheck` and in the browser pass (task 5.1)
- [x] 3.2 Replace the header's Invites link with a People link for devops and admin, with the count badge shown only above 0 and an accessible name that includes the count. Verify in the browser pass

## 4. People page
- [x] 4.1 Turn `InvitesPage` into `InvitesPanel` (no `h1`), add the People page with the two tab links, add the `/people` routes under the guard and `Frame`, and redirect `/invites`. Verify that `/people`, `/people/invites`, and `/invites` land where the spec says for devops, admin, and member
- [x] 4.2 Build the pending requests section: oldest first, the "email not verified" label, Approve (one click, conditional update) and Reject (inline confirmation, calls the reject function), empty state, refresh of the list and the count after each action. Verify in the browser pass
- [x] 4.3 Build the people table: sorted by role then email, status in words, own row marked "(you)", role dropdown with confirmation, Disable with confirmation, Restore, conditional updates with the stale-row message, error mapping, labelled controls. Verify in the browser pass
- [x] 4.4 Make the Invites tab work for an admin (only their own invites listed, create, revoke, regenerate, change role). Verify in the browser pass

## 5. Scripted browser passes (local stack, headless Edge)
- [x] 5.1 Devops pass: header link with no run data, badge only above 0 and its text, a sign-up without a code appears in the pending list and the count updates without reload, approve and reject (with cancel), role changes both ways, disable and restore, the last-devops refusal, no devops option anywhere, a stale click, tab addresses and the `/invites` redirect, keyboard use. Record the results under Verification notes
- [x] 5.2 Admin pass: sees members and admins but no devops, no controls on admin rows, can approve, reject, disable, restore, promote a member, and manage only their own invites. Record the results
- [x] 5.3 Member pass: no link, redirected from `/people`, `/people/invites` and `/invites`, no account data requested. Record the results

## 6. Docs, rollout, and final checks
- [x] 6.1 Update `docs/Auth_and_Roles.md`: the People page, the matrix rows now built, the phase plan, and the SQL approval steps kept as a fallback. Verify every SQL statement still run as written
- [x] 6.2 Update the README sign-in section. Verify it matches the docs
- [x] 6.3 Apply the migration to the hosted project and ship the frontend. Ask before pushing; it changes the live project
- [x] 6.4 On the hosted project: sign up without a code, see it in the pending list and the count, approve it, then reject a second one, and change a role and disable and restore a test account. Verify each outcome
- [x] 6.5 Run `npm run build`, `npm run test -- --run`, `supabase test db`, and the backend unit tests. Verify all pass

## Verification notes
- Database (local): `supabase test db` passes with 253 tests, 31 of them new for approving and rejecting. They cover devops and admin rejecting, only pending accounts being rejectable, a member, a disabled admin with a valid token, and anonymous callers being refused, and a direct delete being refused even with the setting forged. The exception is also tested inside the rules themselves with the owner role carrying a signed-in identity: a vouched delete of an active row is refused, a vouch for one account does not cover another, the vouched pending row can be deleted, and a cleared setting refuses everything.
- Browser (headless Edge, local stack, one run, 59 checks, all passing), devops: People link with no run data, the badge showing 4 and its accessible text, `/people` with the People tab current, pending requests oldest first each labelled "email not verified", the people table sorted devops, admins, members, own row marked "(you)" with no controls, role dropdowns offering only member and admin and none on devops rows; approve moves a request to Everyone and drops the badge without a reload and the person can sign in; reject asks first, cancel leaves it, confirm deletes the account and the person can ask again; role changes both ways with a confirmation; disable and restore; restoring a third devops shows "There can be at most 2 active devops accounts." and leaves the row unchanged; a stale Approve after the person was disabled elsewhere says the account changed and does NOT re-enable them; a stale Reject is refused; a new request raises the badge after a focus refresh; `/invites` redirects to the Invites tab; approving works from the keyboard; controls are named with the person; live regions are present.
- Browser, admin: People link and badge; sees admins and members but no devops; no controls on another admin or on their own row; promotes a member, after which that row has no controls; disables and restores a member; approves and rejects; on the Invites tab does not see an invite devops made, and creates and revokes their own.
- Browser, member: no People link; `/people`, `/people/invites` and `/invites` all go to the home page; no profile list, count, reject, or invite request was made.
- Two things were caught by the test itself rather than the app: the admin and member passes first checked the header before the page had finished its first render, so those waits were added to the script.

## Workflow follow-up
- Archive `add-auth-foundation` first, then `add-invite-signup`, then this change. `openspec archive` will refuse this change's modified `invite-management` delta until phase 2 is archived.
- Phase 4 (email: forgot password, confirmation, invite emails, notifications) is a new change.
