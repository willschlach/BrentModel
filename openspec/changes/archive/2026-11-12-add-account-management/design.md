# Design

## Context

See proposal.md for motivation and scope. This builds on phases 1 and 2:

- `profiles` rules already decide who may change what. RLS lets devops read every profile and an admin read members and admins. The `profiles_enforce_rules` trigger lets an admin set a member's status to `active` or `disabled` and promote a member to `admin`, lets devops change anything (within the 2-maximum, 1-minimum devops limits), and refuses any change to your own role or status. So **approve, disable, restore, and role changes need no new database code**: the screen sends ordinary updates and the database allows or refuses them.
- The one gap is **reject**. It deletes an account, and the same trigger refuses every `INSERT` and `DELETE` by a signed-in user (`'Profiles cannot be created or deleted by users.'`, errcode 42501). Clients also have no delete grant on `profiles`.
- The invite functions already work for admins (an admin can create, revoke, regenerate, and change the role of their own invites; RLS shows them only those). Only the screen is devops-only.
- Frontend today: `/invites` is its own top-level route guarded by `RequireRole role="devops"`, inside `Frame` (the header and page frame that work without run data). `RoleLinks` in `AppHeader` shows an Invites link for devops. `InvitesPage` has its own `h1`.
- The role label in the header comes from the token and refreshes with it. A disabled user is signed out within about a minute by the access watcher.

## Goals / Non-Goals

**Goals:**
- One page where devops and admin handle requests and people, with the database as the authority and the screen mirroring its rules.
- A stale click can never undo someone else's decision.
- A shape that takes a third tab later without rework.

**Non-Goals:**
- Setting the `devops` role, devops invites, and permanent deletion of active accounts from the screen (command line only).
- Analytics, last sign-in, search, paging.
- Any email, and a role choice at approval (approval always gives `member`).

## Decisions

### D1. Reject is one database function with one narrow exception
`public.reject_pending_request(p_user_id uuid)` is `security definer`, `search_path = ''`, executable by `authenticated` only. It reads the caller's live role with `private.actor_role()` and requires devops or admin (an admin may act on members, and pending accounts are members). It locks the target profile, refuses anything that is not `pending`, and then deletes the row from `auth.users`, which cascades to the profile.

The profile rules trigger would refuse that delete, so the function first sets a transaction-local setting, `app.rejecting_user`, to the target's id. The trigger lets a `DELETE` through only when the setting equals the deleted row's id **and** the row is `pending`; every other signed-in delete stays refused. `create or replace` of the trigger function carries this one change.

- Why not loosen the trigger or grant delete: that would open every delete. The setting is useful only to someone who can already run SQL as a signed-in role, and clients can only call functions in `public`, where `set_config` is not exposed.
- Alternative: call the Auth admin API from an Edge Function. Rejected: needs a new service for one delete the database can do.
- Alternative: clear the caller's claims inside the function so the trigger sees a "privileged" caller. Rejected: it silently disables every rule for the rest of the transaction.

> **Spike result (local stack).** The `postgres` role holds `DELETE` on `auth.users`, so a `security definer` function owned by it can delete the account and let the cascade remove the profile. A head-only exact count of `profiles` under RLS returned `Content-Range: 0-1/2` for both a devops user and an admin when two requests were pending. In the tests the exception was checked inside the rules themselves, with the owner role carrying a signed-in identity: a vouched delete of an **active** row is still refused, a vouch for one account does not cover another, the vouched pending row can be deleted, and once the setting is cleared nothing can.

### D2. Everything else is a conditional update
Approve, disable, restore, and role changes are `update profiles set ... where id = $1 and <the state the page showed>` followed by `select`:
- approve: `status = 'pending'`; disable: `status = 'active'`; restore: `status = 'disabled'`; role change: `role = <old role>`.
- Zero rows back means the row changed (or RLS hides it): the screen says "that account has changed" and reloads. This stops a stale Approve from re-enabling someone who was disabled in the meantime.
- A database error is mapped by code: `23514` (the devops limits) shows the database's own message, `42501` shows "You are not allowed to do that", anything else a generic retry message.

### D3. What each viewer gets on each row is a pure function
`allowedActions(viewer, row, isSelf)` in `src/lib/peopleRules.ts` returns which of: approve, reject, disable, restore, and which role options. It is the screen's reading of the database rules, unit tested, and never the authority.

| Viewer | Row | Actions |
| --- | --- | --- |
| anyone | own row | none |
| devops or admin | pending | approve, reject |
| devops | member or admin, active | role options member/admin, disable |
| devops | member or admin, disabled | role options member/admin, restore |
| devops | devops (not self), active/disabled | disable / restore only (no role control) |
| admin | member, active | role options member/admin (promote), disable |
| admin | member, disabled | role options member/admin, restore |
| admin | admin or devops | none |

The role control offers `member` and `admin` only. A disabled row can still have its role changed; restoring is separate.

### D4. Routes and the page frame
- `/people` is a layout route under `RequireAuth`, `RequireRole roles={["devops","admin"]}`, and `Frame` (so it works with no run data, like `/invites` did). Its children: the index (People tab) and `invites` (Invites tab). `/invites` becomes `<Navigate to="/people/invites" replace />`.
- Tabs are links (`NavLink`) in a labelled `nav`, with `aria-current` on the active one. They are not an ARIA tablist, because each tab is a real address and a link is the correct semantics. A third tab is one more child route and one more link.
- `RequireRole` takes `roles: AppRole[]`. Its one existing use is updated.
- `InvitesPage` becomes `InvitesPanel` (the same content without its `h1`/title); the People page owns the `h1`.

### D5. The header link and the pending count
- `RoleLinks` shows **People** for devops and admin, replacing Invites.
- A `PendingCountProvider` (inside `AuthProvider`) holds the count and a `refresh()`. It reads `profiles` with a head-only exact count filtered to `status = 'pending'`, so RLS decides what the viewer can count (devops: all; admin: members, which is every pending account). It refreshes on mount, when the window regains focus, about every 60 seconds while visible, and on `refresh()`, which the People page calls after every action. It does nothing for members.
- The badge renders only above 0, as visible text in the link with an accessible name such as "People, 3 pending requests".

### D6. Confirmations reuse the inline pattern from the Invites screen
Reject, disable, and every role change use the same two-step inline confirmation as Revoke and Regenerate on the Invites tab (a labelled group with a question, Yes, and Cancel). Approve and Restore are one click. Results and errors go to the same always-present `role="alert"` and `role="status"` regions.

### D7. Data and ordering
One `profiles` read feeds both sections: pending rows (oldest first) for the pending section, the rest sorted by role (devops, admin, member) then email for the table. No extra view is needed, because RLS already limits what each viewer receives. A Refresh button reloads on demand.

## Risks / Trade-offs

- [The reject function depends on the `postgres` role being allowed to delete from `auth.users`] → Confirmed in a first spike on the local stack; on the hosted project it is the same role and the same operation as deleting a user in the dashboard SQL editor, and the hosted verification task checks it.
- [A forged `app.rejecting_user` could let a delete through] → Needs raw SQL as a signed-in role, which clients do not have; the exception also requires the row to be pending. A pgTAP test tries a direct delete with the setting forged.
- [The People link and an admin's actions depend on the token's role claim until it renews] → The database already uses the live role, so a stale label can show a link that then shows nothing or refuses; you accepted this.
- [Admin sees "email not verified" requests and has no way to verify] → Accepted earlier; the label states it, and approvers vet identities out of band.
- [Two people act on the same request at once] → The conditional updates and the locked reject make exactly one win; the other sees "that account has changed".
- [Large lists] → Fine at this scale; no paging by design.
- [Archiving: the modified `invite-management` delta cannot be archived until phase 2 is archived] → Tracked in the tasks.

## Migration Plan

1. Spike, then the migration and database tests locally.
2. Build the screens against the local stack and verify with the same scripted browser passes as before, as devops, admin, and member.
3. Deploy the migration (`supabase db push` or CI). It adds a function and replaces one trigger function, so nothing changes for users until the new frontend ships.
4. Ship the frontend (commit and push; Vercel builds it).
5. Verify on the hosted project with a test sign-up: it appears in the pending list and count, approve it, then reject another.

Rollback: redeploy the previous frontend. The function is additive, and the trigger change only adds an exception that nothing can use without the function.

## Open Questions

None that change the specs or the tasks.
