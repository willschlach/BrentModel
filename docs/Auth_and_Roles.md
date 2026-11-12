# Authentication and roles

Sign-in uses Supabase Auth (email and password). Access is decided in the database: each account has one row in `public.profiles` with a role and a status, and row level security reads that row on every request. The web app only reflects what the database allows.

Built so far (phase 1): sign-in and sign-out, persistent sessions, the roles and statuses below, the database rules, and the first-devops script. Everything marked "planned" is documented here so the design stays consistent, but is not built yet.

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
| `pending` | Signed up without an invite and is waiting for approval. | "This account is awaiting approval." |
| `disabled` | Kept on file but cannot use the app. This also covers "removed"; it can be restored. | "This account has been disabled. Contact an administrator." |

A sign-in with correct credentials and no profile row shows "This account has no access. Contact an administrator." A wrong email or password always shows the same "Incorrect email or password." message, so it never reveals whether an account exists.

## What each role can do

Phase 1 builds sign-in and the database rules. The rules are enforced in the database now, so a later screen cannot grant more than this table allows.

| Capability | Member | Admin | Devops | Status |
| --- | --- | --- | --- | --- |
| Sign in, sign out, stay signed in | yes | yes | yes | built |
| Read own profile | yes | yes | yes | built |
| Read other profiles | no | members and admins | all | built (rules) |
| Disable or restore a member | no | yes | yes | rules built, screens planned |
| Approve a pending person | no | yes | yes | rules built, screens planned |
| Promote a member to admin | no | yes | yes | rules built, screens planned |
| Demote an admin to member | no | no | yes | rules built, screens planned |
| Disable or restore an admin or devops | no | no | yes | rules built, screens planned |
| Change own role or status | no | no | no | built |
| Invite a member or an admin | no | yes | yes | planned (phase 2 and 3) |
| Invite a devops | no | no | yes | planned (later) |
| Reject a pending sign-up (deletes the request) | no | yes | yes | planned (phase 3) |
| See selected pages and output | yes | yes | yes | planned |
| See more pages and usage analytics | no | yes | yes | planned |
| Request a data pull from devops | no | yes | n/a | planned |
| Pull data by hand, configure model settings | no | no | yes | planned |
| Simulate another role | no | no | yes | planned |
| Reset a forgotten password | yes | yes | yes | planned (phase 4) |

Devops headcount: never more than 2 active devops accounts and never fewer than 1. A change that would break either is rejected by the database, whichever client makes it.

## Invites and sign-up (planned)

- **Invite:** an admin or devops enters an email and a role (member or admin). The person gets an email with an invite key. The key is tied to that email, fixes the role, works once, and expires after 24 hours.
- **Sign-up with a key:** the key, the email, and a password create the account, already approved. A wrong, expired, used, or mismatched key fails with a clear message.
- **Sign-up without a key:** the account is created as `pending`. The person confirms their email, then an admin or devops approves it (becomes `member`) or rejects it (the request is deleted).
- **Public sign-up is closed in phase 1.** It will be reopened with a gate that refuses any sign-up that does not carry a valid key or that skips the pending flow. That gate is part of the phase 2 design.

## How access is enforced

1. **Sign-in:** after the password is verified, a database function (the custom access token hook) looks up the profile. Active accounts get a token carrying `user_role` and `user_status`. Disabled, pending, and profile-less accounts get no token, and the refusal carries a code the app turns into the messages above. The built-in `role` claim is never touched.
2. **Every request:** row level security reads the caller's *current* profile, not the token. A disabled or demoted user loses access immediately, even while an older token is still valid (tokens last up to 1 hour).
3. **Changes to accounts:** a trigger on `profiles` checks the exact change (who is acting, on whom, what changes) and the devops headcount.
4. **In the browser:** the app signs the user out as soon as it notices the account is no longer active. It checks when the tab regains focus and once a minute while it is visible. The browser is a convenience; the database is the control.
5. **Stale labels:** the role shown in the header comes from the token, so a role change appears at the next token renewal. The database already uses the new role.

Run data is not protected by this yet. The sample `latest.json` has been removed and the app shows "No run data yet". Putting run data behind row level security is the next piece of work after the sign-in phases.

## Phase plan

| Phase | Scope |
| --- | --- |
| 1 (built) | Login page and sign-out, roles and statuses in Supabase, access token hook, row level security, first devops from the command line. |
| 2 | Devops screen to invite admins and members; invites table; invite email; sign-up with a key; email confirmation for sign-ups. |
| 3 | Admin screens: invite, approve or reject pending sign-ups, disable and restore members, promote members. |
| 4 | Notifications, forgot password, and other refinements. |
| Later | Run data behind row level security, devops role simulation, manual data pulls and model settings, admin usage analytics, per-role page visibility, admin requests for a data pull. |

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
3. creates the matching `profiles` row as `devops` / `active`,
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
insert into public.profiles (id, email, role, status)
select id, email, 'devops', 'active'
from auth.users
where email = 'you@example.com';
```

The same database rules apply here: the insert fails if 2 active devops accounts already exist.

## Recovery and break-glass steps

All of these run in the Supabase dashboard SQL editor (or `psql` for the local stack), which connects as the database owner and always works.

**Nobody can sign in and the hook is the suspect.** Fix the function `public.custom_access_token_hook` in the SQL editor, or restore it from `supabase/migrations/`. Do not simply turn the hook off in Authentication, Hooks: sign-in would then work but the app refuses any token without role claims, so everyone stays locked out.

**You are locked out as the only devops.** Re-activate your profile (the headcount rules still apply):

```sql
update public.profiles set status = 'active', role = 'devops'
where email = 'you@example.com';
```

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

`supabase/config.toml` configures the local stack. The hosted project has its own copy of these settings, which must match: custom access token hook on (`public.custom_access_token_hook`), public sign-ups off, and a minimum password length of 8.
