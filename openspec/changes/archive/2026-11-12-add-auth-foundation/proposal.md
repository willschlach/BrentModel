# Proposal

## Why

The web app has no access control. Anyone with the URL can load it, and the README already flags that pages are not access-controlled before real data is loaded. Real model output is coming next, so sign-in and role-based access must exist first. This change lays that foundation: the login experience, the roles and account states, and the database rules that enforce them. It is phase 1 of a phased rollout.

## What Changes

- Add an email/password login page and a logout action to the web app, using the Supabase Auth client already in `frontend/package.json`.
- Keep users signed in across tabs and browser restarts using Supabase's persisted session and automatic token refresh.
- Gate the whole app behind a session. Signed-out visitors see only the login page.
- Add three roles (`devops`, `admin`, `member`) and three account states (`pending`, `active`, `disabled`), stored in a `profiles` table in Supabase.
- Add a custom access token hook that puts the user's role and status into the JWT, and refuses to issue tokens to disabled users.
- Enable row level security so that every policy requires an active, roled user. RLS also checks live account status, so a disable takes effect immediately even while an older JWT is still valid.
- Enforce devops rules in the database: at most 2 active devops, at least 1 active devops, and only devops may change an admin's role or act on a devops account.
- Show a distinct message for each blocked case at login: wrong credentials, no role / no profile, pending approval, and disabled account.
- Disable public sign-ups in Supabase. Phase 1 has no invite or approval flow, so accounts are created only by a script that uses the secret key.
- Add a CLI script that creates the first devops user.
- Remove the synthetic `frontend/public/data/latest.json` from the repo. After login, the app shows a "no run data yet" empty state instead of the dashboard pages.
- **BREAKING**: the dashboard pages (Home, Decision, Why, Data and audit) are no longer reachable until run data is reintroduced in a later change. The app loads the snapshot only after a successful sign-in, and with no file present it shows the empty state.
- Document the full role matrix and phases 2 to 4 as planned work. None of it is built here.

## Capabilities

### New Capabilities
- `user-authentication`: email/password sign-in and sign-out, session persistence and refresh, the signed-out gate, and the per-state messages shown to users who cannot enter.
- `role-access-control`: the roles and account states, the JWT claims issued by the access token hook, RLS requirements, the devops-count and hierarchy rules, disabled and removed-user behavior, and first-devops bootstrap.
- `run-data-availability`: how the app behaves when no run snapshot exists, including the empty state shown to signed-in users.

### Modified Capabilities
<!-- None. openspec/specs/ has no existing capabilities. -->

## Impact

- Frontend: new login page, auth context and route guard in `frontend/src`, changes to `App.tsx` and `SnapshotContext.tsx` so the snapshot loads only after sign-in and a missing file yields an empty state, and a new Supabase client module.
- Supabase: first migrations in `supabase/` (profiles, enums, hook function, RLS policies, devops-count triggers), plus `config.toml` changes (hook enabled, sign-ups disabled, password length, redirect URLs). The hosted project needs the same settings applied.
- Backend: one new Python script for creating the first devops. It reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from the root `.env` and never runs in the browser or on Vercel.
- Repo: `frontend/public/data/latest.json` is deleted, and the README text about the app reading that file needs updating.
- Dependencies: no new runtime dependencies (`@supabase/supabase-js` is already installed). One dev dependency, `vitest`, is added for frontend unit tests.
- Docs: a new `docs/Auth_and_Roles.md` records the role matrix and the phases.

## Out of Scope (planned phases)

- Phase 2: devops invite UI, the invites table, key emails, sign-up with an invite key, and email confirmation for sign-ups.
- Phase 3: admin UI for invites, approving pending sign-ups, and managing members.
- Phase 4: notification polish, forgot password, and other refinements.
- Later: run data behind RLS, devops role simulation, manual data pulls and model settings, admin analytics, per-role page visibility, and the admin request for a data pull.
