# Proposal

## Why

Phase 2 lets people in, but only devops can manage anything, and only through the Invites screen, SQL, or the command line. Pending requests pile up where nobody can see them, admins have no screens at all, and a disabled or promoted account needs a script. This is phase 3 of the rollout (see `docs/Auth_and_Roles.md`): give devops and admins one place to approve requests, see who has access, and change it.

## What Changes

- Add a **People** page for devops and admin, with two tabs: **People** and **Invites**. Each tab is its own address (`/people` and `/people/invites`), so a tab can be linked to and a third one (for example access analytics) can be added later without reshaping the page. The existing `/invites` address redirects to the Invites tab.
- **People tab**:
  - A **Pending requests** section at the top lists everyone who signed up without a code: email, when they asked, and an "email not verified" label. Each has **Approve** (they become an active member) and **Reject** (deletes the request, after a confirmation, so they can ask again).
  - Below it, a table of everyone else the viewer may see, with email, role, status, and created date. Your own row is marked "(you)" and has no actions.
  - **Disable** (after a confirmation) and **Restore** for accounts the viewer may act on.
  - A **role dropdown** on rows the viewer may change, with a confirmation step. Devops can switch members and admins between `member` and `admin`. An admin can promote a member to `admin`. There is no way to set `devops` from the screen; devops accounts are still created only with the command-line script.
- **Invites tab**: the Invites screen from phase 2, now also open to admins. An admin sees and manages only the invites they created; devops sees all of them.
- A **People** link in the header for devops and admin, replacing the devops-only Invites link, with a count badge of pending requests. The badge appears only when the count is above 0 and refreshes on focus, about once a minute, and after any action on the page.
- Add one database function, **reject a pending request**, which checks the caller's live role and deletes only a pending account. It needs a deliberate, narrow exception in the profile rules, which today refuse every delete by a signed-in user.
- Document the new screens in `docs/Auth_and_Roles.md`, mark the matching rows built, and retire the SQL approval steps as the normal path (they remain as a fallback).

## Capabilities

### New Capabilities
- `account-management`: the People page and its tabs, the pending count in the header, approving and rejecting requests, the people table, role changes, disabling and restoring, what each role may do on the screen, the confirmations and error messages, and accessibility.

### Modified Capabilities
- `invite-management`: the Invites screen becomes a tab of the People page and is available to admins for their own invites, not only to devops.
- `role-access-control`: a new requirement for approving and rejecting pending requests, including the one function that may delete an account.

## Impact

- Supabase: one new migration (the reject function and the exception in the profile rules) with pgTAP tests. No schema change to tables. The hosted project needs `supabase db push`.
- Frontend: new People page and tab routes; the Invites page becomes a tab panel; `RequireRole` accepts several roles; the header gets the People link and badge; a small pending-count provider; pure helpers for "which actions does this viewer get on this row" and for action errors, with unit tests. No new dependencies.
- Docs: `docs/Auth_and_Roles.md` (matrix, phase plan, pending requests) and the README.

## Out of Scope

- Setting the `devops` role, inviting devops, and permanent deletion of active accounts from the screen (devops accounts and hard deletes stay command-line only).
- Access analytics and "last sign-in" (the future third tab), search, and paging.
- Emails of any kind, confirmation, forgot password, and notifications: phase 4.
- Choosing a role when approving: approval always gives `member`.
