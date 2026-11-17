# Proposal

## Why

Phase 1 can sign people in, but the only way to create an account is the command-line script. Devops needs a way to bring people in without touching the database: hand someone an invite code, let them sign up with it, and let people who have no code ask for access. This is phase 2 of the rollout (see `docs/Auth_and_Roles.md`).

## What Changes

- Add invite codes. A devops user creates a code for one email and one role (member or admin). The code is 8 characters, written `XXXX-XXXX`, works once, expires after 24 hours, and locks after 10 failed attempts. It is handed over by hand: nothing is emailed in this phase. The database stores only a salted hash, and the plaintext is shown once.
- Add a devops-only "Invites" screen to create an invite, list invites with their status (active, used, expired, revoked, locked), revoke one, and regenerate one (revoke plus a new code for the same email).
- Add a public sign-up page with email, password, and an optional invite code, and links between the sign-in and sign-up pages.
  - A valid code for that email creates an active account with the invite's role and signs the person in at once.
  - A code that is wrong, expired, used, revoked, locked, or for a different email rejects the sign-up with a specific message.
  - No code creates a pending member account, shows "request submitted, awaiting approval", and gives no session.
- Enforce sign-up in two places so one failing cannot open the door: a before-user-created hook that rejects bad codes with clear messages, and a trigger on `auth.users` that creates the profile and consumes the code in the same transaction. The trigger reads only the invite code from the sign-up data and ignores every other field.
- Turn public sign-ups on and email confirmation off (hosted dashboard, and `supabase/config.toml` for the local stack). Confirmation returns in a later phase.
- Add an "Invites" link to the header for devops users. It shows even when there is no run data.
- Adapt phase 1 pieces that the new trigger would otherwise break: the first-devops script, and the profile fixtures in the database tests.
- **BREAKING**: public sign-up, closed in phase 1, is open again. Anyone can now create a pending account, and the only protection against an unwanted active account is the invite code. Pending accounts cannot be approved in the app until phase 3; until then approval is a documented SQL statement.
- Document the new flows, the SQL approval step, and the dashboard settings in `docs/Auth_and_Roles.md`.

## Capabilities

### New Capabilities
- `invite-management`: creating, listing, revoking, and regenerating invite codes; the code format, lifetime, single use, and failed-attempt lock; who may create which invites; the devops Invites screen.
- `account-signup`: the public sign-up page, sign-up with and without a code, the rules that decide between an active account and a pending one, the specific rejection messages, and the pending confirmation.

### Modified Capabilities
- `user-authentication`: signed-out visitors can now reach the sign-up page as well as the sign-in page, and the sign-in page links to it.
- `role-access-control`: the "public sign-up is closed" requirement is replaced by a gated sign-up, profile creation moves into the sign-up trigger, and the first-devops script must work alongside it.

## Impact

- Supabase: new migrations (invites table, code functions, create/revoke/regenerate functions, the before-user-created hook, the `auth.users` trigger) plus pgTAP tests. `config.toml` gains the hook, sign-ups on, confirmation off. The hosted project needs the same settings applied by hand in the dashboard, and only after the gates are deployed.
- Frontend: new sign-up page and Invites page, new routes, header link, and an `inviteErrors` helper alongside the existing auth error helpers. No new dependencies.
- Backend: `bootstrap_devops.py` changes to update the profile the trigger creates, rather than inserting one.
- Existing tests: the three database test files that insert profiles by hand are adjusted.
- Docs: `docs/Auth_and_Roles.md` and the README.

## Out of Scope (planned phases)

- Phase 3: the approvals list for pending accounts (approve and reject), the "email not verified" label on those requests, and admin versions of the invites screen.
- Phase 4: email delivery of invites and confirmation, forgot password, and other notifications.
- Later: invites for devops accounts, and the items already listed in `docs/Auth_and_Roles.md`.
