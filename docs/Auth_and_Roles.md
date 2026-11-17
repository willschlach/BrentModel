# Authentication and roles

Sign-in uses Supabase Auth (email and password). Access is decided in the database: each account has one row in `public.profiles` with a role and a status, and row level security reads that row on every request. The web app only reflects what the database allows.

Built so far (phases 1 to 3, plus password reset from phase 4): sign-in and sign-out, persistent sessions, the roles and statuses below, the database rules, the first-devops script, invite codes, a public sign-up page that works with or without a code, the People page where devops and admins approve requests, manage invites, and change who has access, and a forgot-password flow that is switched off in production until email works (see "Forgot password"). Not built yet: email confirmation, invite emails, in-app notifications, and the items marked "planned". Everything marked "planned" is documented so the design stays consistent.

## Roles and statuses

One role per account:

| Role | Purpose |
| --- | --- |
| `devops` | Runs the system. Sees everything, acts on any account. At most 2 active, at least 1 always. |
| `admin` | Manages members. Sees more pages and deeper usage analytics (planned). |
| `member` | Uses the app. Sees selected pages and output only (planned). |

One status per account:

| Status | Meaning | What the person sees at sign-in |
| --- | --- | --- |
| `active` | Can use the app. | They get in. |
| `pending` | Signed up without an invite code and is waiting for approval. | "This account is awaiting approval." |
| `disabled` | Kept on file but cannot use the app. This also covers "removed"; it can be restored. | "This account has been disabled. Contact an administrator." |

A sign-in with correct credentials and no profile row shows "This account has no access. Contact an administrator." A wrong email or password always shows the same "Incorrect email or password." message, so it never reveals whether an account exists.

## What each role can do

The rules are enforced in the database, so a later screen cannot grant more than this table allows.

| Capability | Member | Admin | Devops | Status |
| --- | --- | --- | --- | --- |
| Sign in, sign out, stay signed in | yes | yes | yes | built |
| Create an account with an invite code, or ask for access without one | anyone | anyone | anyone | built |
| Read own profile | yes | yes | yes | built |
| Read other profiles | no | members and admins | all | built (rules) |
| Create an invite (member or admin) | no | yes | yes | built (People page, Invites tab) |
| See, revoke, regenerate, or change the role of invites | no | own invites | all | built (People page, Invites tab) |
| Approve a pending person | no | yes | yes | built (People page) |
| Reject a pending request (deletes it) | no | yes | yes | built (People page) |
| Disable or restore a member | no | yes | yes | built (People page) |
| Promote a member to admin | no | yes | yes | built (People page) |
| Demote an admin to member | no | no | yes | built (People page) |
| Disable or restore an admin or devops | no | no | yes | built (People page) |
| Change own role or status | no | no | no | built |
| Invite a devops | no | no | no | planned (later; devops accounts come from the script) |
| See selected pages and output | yes | yes | yes | planned |
| See more pages and usage analytics | no | yes | yes | planned |
| Request a data pull from devops | no | yes | n/a | planned |
| Pull data by hand, configure model settings | no | no | yes | planned |
| Simulate another role | no | no | yes | planned |
| Reset a forgotten password | yes | yes | yes | built; off in production until email works (see "Forgot password") |

Devops headcount: never more than 2 active devops accounts and never fewer than 1. A change that would break either is rejected by the database, whichever client makes it.

## Invite codes and sign-up

### Invite codes

A devops user opens Invites, enters an email and a role (member or admin), and gets a code. Nothing is emailed: give the code to the person yourself.

- The code is 8 characters shown as `XXXX-XXXX`, from an alphabet without 0, O, 1, I and L. It is shown **once**, when it is created; if it is lost, regenerate the invite.
- It is tied to one email, fixes the role, works once, and expires 24 hours after it is created.
- Only a salted hash is stored. Nobody, including devops and the database owner, can read a code back.
- After 10 wrong attempts the invite is **locked**. A locked invite rejects even the right code until it is regenerated.
- There is exactly **one invite per email**, in any status. Inviting an email that already has an unused invite, even a revoked one, reuses it: new code, a fresh 24 hours, the attempt count reset, the revocation cleared, and the role you pick. An email that already has an account cannot be invited, and for a disabled account the message says to restore it instead. Removing an account removes its invite, so that email can be invited again.
- Status is always one word: `active`, `used`, `disabled`, `expired`, `revoked`, or `locked`. `disabled` is a used invite whose account has been disabled; it goes back to `used` when the account is restored. Revoke works on active, expired, and locked invites. Regenerate works on anything not yet used, revoked ones included, and gives the same invite a fresh code.
- **Change role:** on the Invites screen the role of an unused, unrevoked invite is a dropdown (member or admin). Changing it keeps the code and the expiry. Used and revoked invites cannot be changed; regenerate a revoked one first.
- Deleting an account deletes its invite (a used one included). Disabling does not delete it, but its status shows `disabled`.
- Devops sees every invite. The database also lets an admin create, see, revoke, and regenerate their own invites; that screen arrives in phase 3.

### Signing up

The sign-up page has email, password (at least 8 characters), repeated password, and an optional invite code. Code entry ignores case, spaces, and the hyphen.

- **With a valid code for that email:** an active account with the invite's role is created and the person is signed in at once.
- **Without a code:** a pending member account is created, the person is told the request is awaiting approval, and they get no session. Until phase 3 an approver uses SQL (below).
- **With a code that does not check out:** the sign-up is rejected, nothing is created, and the page says why:

| Reason | Message |
| --- | --- |
| No invite for the email | There is no invite for this email address. |
| Wrong code (counts toward the 10) | That invite code is incorrect. |
| Expired | This invite has expired. Ask for a new code. |
| Already used | This invite has already been used. |
| Revoked | This invite was revoked. Ask for a new code. |
| Locked | This invite is locked after too many wrong attempts. Ask for a new code. |
| Email already registered | This email is already registered. |

- Only the code decides the outcome. A role or status sent along with a sign-up is ignored.
- An unfinished code (fewer than 8 characters) is caught in the browser and does not count as an attempt.

### Known limits

- No email is sent and no email is confirmed. Nobody verifies who owns a pending request's email address, so approvers must check out of band that the person asking is who the email says. The People page labels every pending request "email not verified".
- Sign-up messages say whether an email has an invite or an account. That is accepted for a small, known group.

## How access is enforced

1. **Sign-up has two gates.** A before-user-created hook gives the clear messages above. A trigger on `auth.users` enforces the same rules in the same transaction as creating the account: a valid code creates an active account and uses up the code, no code creates a pending member, anything else rolls the sign-up back. If the hook is ever off or broken, the trigger still decides, with a generic error message. The trigger also removes the code from the stored sign-up data.
2. **Sign-in:** after the password is verified, a database function (the custom access token hook) looks up the profile. Active accounts get a token carrying `user_role` and `user_status`. Disabled, pending, and profile-less accounts get no token, and the refusal carries a code the app turns into the messages above. The built-in `role` claim is never touched.
3. **Every request:** row level security reads the caller's *current* profile, not the token. A disabled or demoted user loses access immediately, even while an older token is still valid (tokens last up to 1 hour). Creating, revoking, and regenerating invites are database functions that check the live role first.
4. **Changes to accounts:** a trigger on `profiles` checks the exact change (who is acting, on whom, what changes) and the devops headcount.
5. **In the browser:** the app signs the user out as soon as it notices the account is no longer active. It checks when the tab regains focus and once a minute while it is visible. The browser is a convenience; the database is the control.
6. **Stale labels:** the role shown in the header comes from the token, so a role change appears at the next token renewal. The database already uses the new role.

Run data is not protected by this yet. The sample `latest.json` has been removed and the app shows "No run data yet". Putting run data behind row level security is the next piece of work after the sign-in phases.

## Phase plan

| Phase | Scope |
| --- | --- |
| 1 (built) | Login page and sign-out, roles and statuses in Supabase, access token hook, row level security, first devops from the command line. |
| 2 (built) | Invite codes by hand, the devops Invites screen, the sign-up page, pending requests, the two sign-up gates. |
| 3 (built) | The People page for devops and admin: the pending requests list (approve and reject, labelled "email not verified") with a count in the header, the people table (role changes, disable and restore), and the Invites screen as a tab, open to admins for their own invites. |
| 4 (started) | Forgot password is built, with a switch that keeps it off in production until email works. Next, in order: email confirmation, invite emails, and in-app notifications. |
| Later | Run data behind row level security, devops role simulation, manual data pulls and model settings, admin usage analytics, per-role page visibility, admin requests for a data pull, invites for devops accounts. |

## The People page

Devops and admins have a **People** link in the header. When there are pending sign-up requests, a count appears beside it; it refreshes when the window regains focus, about once a minute, and after any action on the page. Members do not see the link, and opening the page address sends them to the home page.

The page has two tabs, each with its own address: **People** (`/people`) and **Invites** (`/people/invites`). The old `/invites` address leads to the Invites tab.

**People tab.** Pending requests come first, oldest first, each marked "email not verified": **Approve** makes the person an active member (one click), **Reject** deletes the request after a confirmation and the person can ask again. Below that, everyone else the viewer may see, sorted devops, admins, members. Your own row is marked "(you)" and has no controls.

| Viewer | Sees | Can do |
| --- | --- | --- |
| Devops | everyone | Approve or reject requests. Switch a member or admin between `member` and `admin`. Disable or restore a member, an admin, or another devops account. |
| Admin | members and admins | Approve or reject requests. Promote a member to `admin`. Disable or restore a member. No controls on other admins. |

- Disabling, rejecting, and every role change ask for a confirmation first.
- The screen never offers the `devops` role. Devops accounts are created only with the command-line script, so a devops row has no role control (only disable and restore).
- Approving always gives `member`; promote afterward if needed.
- Each change is conditional on the state the page showed. If someone else changed the account in the meantime, the screen says so and reloads, and nothing is overwritten (a stale Approve cannot re-enable a person who has since been disabled).
- The database has the last word. The two devops limits are reported in its own words ("There can be at most 2 active devops accounts.", "There must always be at least 1 active devops account.").
- A role change takes effect in the database at once. The role shown in that person's header updates when their session next renews, and a disabled person is signed out within about a minute.

**Invites tab.** The invite screen described above. Devops sees every invite; an admin sees and manages only the invites they created.

## Forgot password

A person who has forgotten their password uses a 6-digit code sent by email. There is no reset link: email scanners can open a link and use it up, and the app's sign-in client is not set up to receive one.

**The flow.**
1. On the sign-in page, **Forgot password?** opens `/forgot-password`. The person enters their email and the page says: "If an account exists for that email, a 6-digit code has been sent." It says exactly this whether or not there is an account, and no email is sent for an address with no account.
2. **Enter the code** opens `/reset-password` with the email filled in. The person enters the code and a new password twice, with the same live checklist as sign-up. A pasted code with a space or hyphen is fine.
3. A correct code signs them in with the new password, and every other session of that account is signed out. A wrong, expired, or already-used code all read "incorrect or has expired" (the server cannot tell them apart), and **Send a new code** is on the page. Codes work once and last 10 minutes.
4. If the code is accepted but the server then rejects the new password (for example it is the same as the old one), the page keeps the person signed in and asks for another password only. A new code is not needed, and would not work.

**Disabled and pending accounts** receive the email but cannot finish: they see the same message as at sign-in ("disabled" or "awaiting approval") and their password is unchanged.

**The switch.** The pages and the link exist only while `VITE_PASSWORD_RESET_ENABLED` allows them. Unset, it is **on in development and off in a production build**; `true` or `false` overrides either. Off means no "Forgot password?" link, and both addresses lead to the sign-in page. To turn it off locally while your `frontend/.env.local` points at the hosted project, add `VITE_PASSWORD_RESET_ENABLED=false`.

**Why it is off in production.** Supabase's built-in mailer only delivers to addresses on your project's team and allows about 2 emails per hour, so it cannot serve real users. Until you add a custom email provider (SMTP), only a team member's own address will receive a code, and anyone else sees "Email is not available for this address yet. Ask an administrator to reset your password."

**Turning it on in the hosted project.** Do these in order:
1. **Reset password email template.** In the dashboard, Authentication, Email Templates, **Reset password**: set the subject to `Your password reset code` and replace the body with the HTML below. The default template contains a link that does not work with this app, so skip this and people get a useless email.

```html
<h2>Reset your password</h2>
<p>Your password reset code is:</p>
<p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">{{ .Token }}</p>
<p>Enter it on the reset password page, together with your new password. The code works once and expires in 10 minutes.</p>
<p>If you did not ask to reset your password, you can ignore this email. Your password has not been changed.</p>
```

2. **Code lifetime.** Set the email OTP expiration to `600` seconds. It is under Authentication, Sign In / Providers, Email (I have not seen your dashboard and Supabase moves this setting around; search the Authentication settings for "OTP" if you do not see it). It applies to every email code and link on the project, which is fine while the reset is the only email in use.
3. **Switch.** In Vercel, set `VITE_PASSWORD_RESET_ENABLED=true` for Production (and Preview if you want it there) and redeploy. Vite reads it at build time.
4. **Test with a team address** (an email on your Supabase team): ask for a code, read the email, finish a reset. Then try an address that is not on the team. It should say email is not available for it yet.

For everyone to receive codes, set up custom SMTP (Authentication, SMTP Settings; Resend, Postmark, SES and others work). After that, only the limits of your provider apply.

**While email is not available,** devops can set a password directly:

```bash
python -m brent_hedge.set_password --email person@example.com
```

Run it from `backend/`, like the other scripts. It reads the same repo-root `.env`, shows the project and the account it found, asks for the new password twice (at least 8 characters), and asks before changing anything. `--yes` skips the question, and the `NEW_PASSWORD` environment variable replaces the prompts for automation. It works for an account in any status but does not change the status: a disabled account gets the password and stays disabled. It does not sign out sessions the person already has.

**Local testing** needs no email provider: the local stack's Mailpit (http://127.0.0.1:54324) catches every email, including the reset code. The local template and the 10-minute lifetime are in `supabase/config.toml` and `supabase/templates/recovery.html`.

## Pending requests: SQL and command line

The People page is the normal way to handle requests. These statements and the removal script are for when you cannot use it, and for cleaning up test accounts. Run the SQL in the Supabase SQL editor (or `psql` for the local stack). They run as the database owner, so the account rules for who may act on whom do not apply, but the devops headcount limits still do. Check that you know who the person is before approving: their email is not verified.

### Remove or disable an account from the command line

For rejecting a request, clearing a test account, or switching a real person off, use the script instead of SQL. Run it from `backend/`. It reads the same repo-root `.env` as the first-devops script, shows which project it is about to change and which account it found, and asks before doing anything.

```bash
# Delete the account (permanent; the person can sign up again). Use for pending requests and test accounts.
python -m brent_hedge.remove_user --email person@example.com

# Keep the account but block access (reversible). Use for a real person.
python -m brent_hedge.remove_user --email person@example.com --disable
```

`--yes` skips the question, and `--env-file PATH` reads another file. The database's rules still apply: the last active devops account cannot be deleted or disabled. **Deleting an account also deletes the invite for its email**, whatever its status, so it disappears from the Invites screen too; this happens in the database, so it holds for the SQL below and the dashboard as well. Invites the person created for others are kept, with no creator shown. Disabling keeps the invite, and its status shows `disabled`. To restore a disabled account, set its status back to `active` (see "Recovery and break-glass steps").

### With SQL instead

The same things in the Supabase SQL editor (or `psql` for the local stack).

List pending requests, oldest first:

```sql
select email, created_at
from public.profiles
where status = 'pending'
order by created_at;
```

Approve one (they become an active member and can sign in):

```sql
update public.profiles
set status = 'active'
where email = 'person@example.com' and status = 'pending';
```

Reject one (deletes the account and the request, so they can ask again):

```sql
delete from auth.users
where email = 'person@example.com'
  and id in (select id from public.profiles where status = 'pending');
```

Clear out old requests, for example everything pending for more than 30 days:

```sql
delete from auth.users
where id in (
  select id from public.profiles
  where status = 'pending' and created_at < now() - interval '30 days'
);
```

## Project settings (hosted)

These live in the Supabase dashboard under Authentication, and must match `supabase/config.toml`, which only configures the local stack. They need to be set **in this order**, and only after the migrations are deployed:

1. Auth Hooks: set **Before User Created** to `public.hook_before_user_created`. (Custom Access Token stays `public.custom_access_token_hook`.)
2. Sign In / Providers, Email: turn **Confirm email** off. Nobody confirms email in phase 2, and an invite-gated sign-up does not need it.
3. Sign In / Providers: turn **Allow new users to sign up** on. Do this last: it is the step that opens the sign-up page to anyone who can reach the app.

Minimum password length stays 8.

To roll back, do the reverse, starting by turning sign-ups off.

## Creating the first devops account

Public sign-up is closed, so the first devops account is created from the command line with the Supabase secret key. Run this on a trusted machine only. Never put the secret key in `frontend/.env.local`, in Vercel, or in the browser.

### Prerequisites

- The database migrations are applied (`supabase db push` for the hosted project, `supabase db reset` for the local stack).
- The repo-root `.env` has `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for the project you want to create the account in. See `.env.example`.

### Run the script

From `backend/`:

```bash
python -m brent_hedge.bootstrap_devops --email you@example.com
```

It prompts for the password (twice), prints the project URL it is about to use, and asks for confirmation before creating anything. It then:

1. checks that fewer than 2 active devops accounts exist,
2. creates an email-confirmed auth user,
3. promotes the profile that the database sign-up trigger created for every new user (a pending member) to `devops` / `active`,
4. deletes the auth user again if step 3 fails, so no half-created account is left behind.

The password must be at least 8 characters. Options:

| Option | Meaning |
| --- | --- |
| `--email` | Account email. Prompted for if omitted. Stored in lower case. |
| `--yes` | Skip the confirmation prompt. |
| `--env-file PATH` | Read settings from another file instead of the repo-root `.env`. |

Environment variables win over the file. Setting `BOOTSTRAP_PASSWORD` skips the password prompts (for automation only; do not leave it in your shell history or profile).

To target the local stack instead of the hosted project, override the two settings for one run. The local secret key is shown by `supabase status`.

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<local secret key> \
  python -m brent_hedge.bootstrap_devops --email you@example.com
```

Plain `http://` is accepted only for `localhost` and `127.0.0.1`.

### Fallback: dashboard and SQL

If the script cannot be used, create the account by hand.

1. In the Supabase dashboard, open Authentication, then Users, then Add user. Enter the email and password and tick Auto Confirm User.
2. In the SQL editor, run this with the same email:

```sql
update public.profiles
set role = 'devops', status = 'active'
where email = 'you@example.com';
```

Creating the user already gave it a pending member profile (the sign-up trigger does that), so this is an update, not an insert. The same database rules apply: the update fails if 2 active devops accounts already exist.

## Recovery and break-glass steps

All of these run in the Supabase dashboard SQL editor (or `psql` for the local stack), which connects as the database owner and always works.

**Nobody can sign in and the sign-in hook is the suspect.** Fix the function `public.custom_access_token_hook` in the SQL editor, or restore it from `supabase/migrations/`. Do not simply turn the hook off in Authentication, Hooks: sign-in would then work but the app refuses any token without role claims, so everyone stays locked out.

**Sign-ups are being abused (a flood of pending requests).** In the dashboard, Authentication, Sign In / Providers, turn **Allow new users to sign up** off. Existing users can still sign in. Then clean up with the SQL in "Pending requests".

**Sign-up is broken for everyone.** If the before-user-created hook is the suspect, remove it under Authentication, Auth Hooks: the trigger on `auth.users` still enforces the rules, with a generic error message. If the trigger function is the suspect, replace it with `create or replace function private.handle_new_user()` from a corrected migration. On the local stack the `postgres` role cannot disable or drop triggers on `auth.users` (the table belongs to `supabase_auth_admin`); assume the same on the hosted project, and turn sign-ups off while you fix it.

**You are locked out as the only devops.** Re-activate your profile (the headcount rules still apply):

```sql
update public.profiles set status = 'active', role = 'devops'
where email = 'you@example.com';
```

**Someone forgot their password and email is not working.** Use the command in "Forgot password" (`python -m brent_hedge.set_password --email ...`), then give them the new password to change.

**End a person's access right now.**

```sql
update public.profiles set status = 'disabled' where email = 'person@example.com';
```

Their database access stops on their next request. Their app signs out within a minute, or when they next focus the tab.

**Restore someone.** Set `status` back to `'active'` the same way.

## Local development

```bash
supabase start        # needs Docker; prints the local URL, publishable key, and secret key
supabase db reset     # rebuilds the local database from supabase/migrations/
supabase test db      # runs the database tests in supabase/tests/database/
```

To run the web app against the local stack instead of the hosted project, set the two variables for one run (shell variables win over `frontend/.env.local`). From `frontend/`, start the usual dev script with:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=<local publishable key> npm run dev
```

`supabase/config.toml` configures the local stack: both hooks on, sign-ups on, email confirmation off, a minimum password length of 8, and the reset email as a code that lasts 10 minutes. The hosted project has its own copy of these settings, which must match; see "Project settings (hosted)".
