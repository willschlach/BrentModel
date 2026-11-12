# Design

## Context

See proposal.md for motivation and scope.

Current state, as observed in the repo:
- The app is a static React + Vite + TypeScript site on Vercel with a hash router (`createHashRouter`). It has no server of its own.
- `@supabase/supabase-js` is installed but unused. `frontend/.env.local` holds the project URL and publishable key. The root `.env` holds the secret key for Python jobs.
- `supabase/` has a `config.toml` and no migrations. `[auth]` currently has `enable_signup = true`, `enable_confirmations = false`, `jwt_expiry = 3600`, refresh token rotation on, and no hooks enabled.
- `SnapshotProvider` fetches `data/latest.json` on startup, and `Shell` needs a snapshot to render. `vercel.json` has no rewrites, so a missing file returns 404 in production, while the Vite dev server answers with `index.html`.
- The backend has no HTTP surface. It only has batch jobs, and `export.py` writes `latest.json`.

Constraints from the discussion: Supabase-only (no new server), email/password only, one role per account, very few users, and speed is not a concern. The hosted Supabase project is the real target, and a local stack (`supabase start`, Docker is present) is available for tests.

## Goals / Non-Goals

**Goals:**
- Make the database the authority on who may do what. The browser only reflects it.
- Keep the schema ready for phases 2 to 4 without building them.
- Make a locked-out state recoverable. The operator can always get back in.

**Non-Goals:**
- Protecting run data. The data path is a later change, and the UI gate alone does not protect files served from `public/`. Nothing sensitive is served in phase 1 because the sample file is removed.
- Invites, approvals, sign-up, email confirmation, password reset, and any admin or devops UI.
- Inactivity timeouts or session time-boxing. I believe these are paid-plan Supabase features and I have not verified that for this project.
- Multi-factor authentication, SSO, and social login.

## Decisions

### D1. One `profiles` row per account, with role and status as enums
`public.profiles(id uuid primary key references auth.users on delete cascade, email text, role app_role not null, status account_status not null, created_at, updated_at)`. `app_role` is `devops | admin | member`. `account_status` is `pending | active | disabled`.

- Alternative: store role in `auth.users.raw_app_meta_data`. Rejected: it cannot be constrained or queried with the headcount rules, and RLS cannot cheaply reference it.
- Alternative: a many-to-many roles table. Rejected: one role per account is a stated rule, and a single column makes it impossible to violate.
- Soft removal is `status = 'disabled'`. Hard deletion of a profile is not exposed to clients. (Rejecting a pending request will delete it in phase 3 through a privileged path.)

### D2. Custom access token hook adds claims and refuses blocked accounts
> **Spike result (local stack, supabase-js 2.119.0).** When the hook returns an error, both `signInWithPassword` and `refreshSession` fail with `AuthApiError`, `status: 403`, `code: 'unknown'`, and `message` equal to the hook's message string. So the app must read the stable code from the **message prefix** (`ACCOUNT_DISABLED`, and so on) and must not rely on `error.code`. After a refused refresh the client **keeps the old session in storage**, so the app has to call `signOut()` itself when it sees one of these codes.
A Postgres function in `public` is registered as the custom access token hook. It looks up the profile by the user id in the event.

- Active with a role: add top-level claims `user_role` and `user_status` to the token. The built-in `role` claim is left alone because Postgres uses it to pick the database role (`authenticated`). Overwriting it would break every request.
- Disabled, pending, or no profile: return the hook's error response instead of a token. The message begins with a stable code (`ACCOUNT_DISABLED`, `ACCOUNT_PENDING`, `ACCOUNT_NO_ROLE`) that the frontend maps to the user-facing messages.
- The function is `security definer`, has `execute` granted to `supabase_auth_admin` only (revoked from `public`, `anon`, `authenticated`), and `supabase_auth_admin` gets a narrow `select` policy on `profiles`.
- Registered in `config.toml` for local use, and in the hosted project through `supabase config push` or the dashboard (see Migration Plan).

The hook runs after the password is verified, so these messages are only reachable with correct credentials and do not reveal which emails have accounts.

### D3. RLS and triggers decide from the live profile, not from the token claims
You chose "RLS also checks live status". I'm going slightly further: policies and triggers read the caller's current role and status from `profiles`, not only status. A demoted admin who still holds a valid token (up to an hour) must not keep admin powers, and the lookup cost is irrelevant at this scale. The claims are for the UI and for future cheap reads.

- One helper function in a non-exposed schema (`private`): `actor_role()`, `security definer`, which returns the caller's role only when the caller's profile is `active` (null otherwise), reading `profiles` by `auth.uid()`. It is not called `current_role` because that is an SQL keyword. Policies call them as `(select private.fn())` so Postgres evaluates them once per statement. Using `security definer` also avoids infinite recursion when a `profiles` policy needs to read `profiles`.
- Alternative: trust token claims only. Rejected for the stale-claim window above.
- RLS is enabled on `profiles`, and the grants to `anon` and `authenticated` are limited to `select` and `update` on the columns that may change. There are no client insert or delete grants.

### D4. Hierarchy and headcount rules live in a trigger
RLS can say which rows a caller may touch, but it cannot compare old and new values. A `before insert or update or delete` trigger on `profiles` enforces:
- No account may change its own role or status.
- A member cannot change anything.
- An admin may only change a member's status, or promote a member to admin. Nothing else.
- Devops may change any account.
- At most 2 active devops, and at least 1 active devops after any change. Restoring a devops at the cap is rejected. Deleting the last active devops is rejected.
- Headcount checks take a transaction-level advisory lock first, so two concurrent changes cannot both pass a check that only one should.

Callers with no `auth.uid()` (the secret key, the SQL editor, migrations) skip the actor rules, because they are privileged by definition, but the headcount rules still apply to them.

### D5. Public sign-up is closed in configuration
`[auth] enable_signup = false`. The Auth admin API (used by the bootstrap script) is not affected by that setting. `enable_confirmations` stays off in phase 1 because nobody can sign up. Phase 2 will need sign-up back on for the invite flow; the plan is to re-enable it and add a before-user-created hook that rejects any sign-up without a valid invite key. That decision belongs to phase 2.

Password length is raised to 8, with no complexity rules. This is an assumption you did not specify, and it is easy to change.

### D6. First devops comes from a Python script using the Auth admin API
> **Spike result (local stack).** `POST /auth/v1/admin/users` with the secret key sent as the `apikey` header alone (no `Authorization` header) creates a confirmed user while `enable_signup = false`. A direct `signUp` with the publishable key is refused with `422 signup_disabled`. The same call still has to be confirmed against the hosted project in task 7.3.
`backend/scripts/create_first_devops.py` reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from the root `.env`, prompts for email and password with `getpass` (never as command-line arguments, which land in shell history), creates a confirmed auth user, then inserts the `profiles` row as `devops` / `active`. If the profile insert fails, it deletes the user it just created.

- It uses the standard library (`urllib`) against the REST endpoints, so `requirements.txt` does not change.
- Alternative: SQL pasted into the dashboard. Rejected as the main path because it is not repeatable or testable, but it stays the documented fallback.
- Alternative: the Supabase Python SDK. Rejected only to avoid a new dependency for one script.

### D7. Frontend: one auth provider, a route guard, and a status watcher
- `src/lib/supabase.ts` creates the client from the two `VITE_` variables. It enables session persistence and auto-refresh, and uses the PKCE flow so that later email links return a `?code=` in the query string instead of tokens in the URL fragment, where the hash router would swallow them. Automatic URL session detection is left off until phase 2 has a redirect route to handle it. If the variables are missing, the app shows a configuration error instead of a broken login.
- `AuthProvider` exposes one of: `loading`, `misconfigured`, `signedOut` (with an optional notice saying why the app ended the session), or `signedIn` (session, email, role). A separate `blocked` state turned out to be unnecessary: a refused sign-in never produces a session, and a session whose token lacks an active role is signed out at once with the "no access" notice. Sign-out uses the local scope so it ends only this device's session. It subscribes to the auth state events, which also covers sign-out in other tabs.
- A route guard wraps the router's children. Signed-out visitors go to `/login` with a `from` path. The `from` value is accepted only if it is an internal path (starts with a single `/`), so the login page cannot be used as an open redirect.
- Withdrawn access: while signed in and the tab is visible, the app checks every 60 seconds and on window focus by reading the caller's own profile. If it gets no row (RLS denies a disabled user), it forces a token refresh. The hook then refuses with the specific code, and the app shows that message and signs out.
- The snapshot provider moves inside the guard, so it only fetches after sign-in.
- `loadSnapshot` returns "no data" for a 404 or a non-JSON body (the Vite dev fallback), throws for other failures, and keeps the existing error for an unsupported `schemaVersion`.
- The shell is split so the header (brand, user, sign out) renders without a snapshot. The navigation links to snapshot pages appear only when a snapshot exists.

### D8. Remove the sample snapshot and keep it out
`frontend/public/data/latest.json` is deleted with `git rm` and added to `.gitignore`, since `export.py` writes there by default and someone could re-commit it. The README and `docs/Web_App_Design_Spec.md` lines that say the app reads that file are updated. Git history keeps the old file, which is synthetic and was already public.

### D9. Testing
- Database: pgTAP tests (`supabase test db`) on the local stack cover the hook, the policies, the hierarchy rules, and the headcount rules, including the concurrent case where feasible.
- Frontend: add `vitest` as a dev dependency and unit test the pure logic: error-code to message mapping, redirect sanitizing, and snapshot-response classification. The login page and guard get a manual checklist in tasks because there is no component-testing setup today.
- Python: `unittest`, matching the existing style, for the script's input validation and its cleanup path, with HTTP calls stubbed.

## Risks / Trade-offs

- [A bug in the hook blocks every login, including yours] → Keep the function small and defensive, cover it with tests, and document that the hook can be switched off in the dashboard as a break-glass step. Keep the SQL fallback for creating a devops account.
- [Hook errors may reach supabase-js in a different shape than assumed] → The first apply task is a spike that calls the real local stack and records the exact error shape before the mapping code is written.
- [The new-style secret key may not be accepted by the Auth admin endpoints in the way the script assumes] → Verify in the same spike. If it fails, fall back to the SQL path for the first devops and adjust D6.
- [Stale roles in the token for up to the 1 hour token lifetime] → Mitigated because every policy and trigger reads the live profile. The UI may show an old role label until the next refresh.
- [Hosted project and `config.toml` drift apart] → Apply settings through `supabase config push` where supported, otherwise follow a checklist in the README, and verify with a sign-in test against the hosted project.
- [The static site still serves its own JavaScript to anyone] → Accepted. There are no secrets in the bundle, and protecting data is the next change. The UI gate is a convenience, and RLS is the control.
- [Open redirect through the login `from` parameter] → Only internal paths are accepted, with unit tests.
- [Locking out the last devops] → The trigger refuses it. The SQL editor fallback remains.
- [Removing the dashboard pages from view is a visible regression] → Intended and called out as breaking. Data returns in the next change.

## Migration Plan

1. Start the local stack. Write migrations and pgTAP tests, then run the spike and record its findings.
2. Build and test the frontend against the local stack.
3. Apply migrations to the hosted project (`supabase db push`), then apply the auth settings (enable the hook, disable sign-ups, password length, redirect URLs).
4. Run the script to create the first devops, and sign in on the hosted project.
5. Deploy the frontend to Vercel.

Rollback: switch off the hook and re-enable sign-ups in the dashboard if sign-in is blocked, and redeploy the previous Vercel build. Migrations are additive. The old sample file can be restored from git history.

## Open Questions

- Which production URL(s) belong in the redirect allow-list? It is only needed once email links exist (phase 2), so it does not affect this change.
