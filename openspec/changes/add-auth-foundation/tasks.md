# Tasks

## 1. Local stack and spike
- [x] 1.1 Start the local Supabase stack with `supabase start` and verify `supabase status` shows the API and database running
- [x] 1.2 Spike: register a throwaway hook that returns an error for one test user, call `signInWithPassword` from a scratch script, and record the exact error shape that supabase-js exposes. Verify by writing the finding (status, code, message) into a short note at the top of `design.md` Decision D2
- [x] 1.3 Spike: call the Auth admin create-user endpoint using the `SUPABASE_SECRET_KEY` style key against the local stack with `enable_signup = false`, and verify a user is created. If it is not accepted, record the fallback in `design.md` Decision D6

## 2. Database schema, hook, and rules
- [x] 2.1 Add a migration creating the `app_role` and `account_status` enums and the `profiles` table with RLS enabled and grants limited as in D3. Verify with `supabase db reset` completing cleanly and `\d profiles` showing the columns
- [x] 2.2 Add the `private` helper functions for current role and active check, and the `profiles` select and update policies for the visibility rules. Verify with pgTAP tests for the "Visibility of accounts depends on role" scenarios
- [x] 2.3 Add the trigger enforcing self-change, member, and admin limits (D4). Verify with pgTAP tests for the admin, devops, member, and self-change scenarios
- [x] 2.4 Add the headcount rules to the trigger, with the advisory lock and the delete guard. Verify with pgTAP tests for third devops, last devops, remove-other-devops, and restore-at-cap
- [x] 2.5 Add the custom access token hook function with its grants and the `supabase_auth_admin` policy. Verify with pgTAP tests for active, disabled, pending, and no-profile accounts, and that claims `user_role` and `user_status` are present while `role` is unchanged
- [x] 2.6 Update `supabase/config.toml`: register the hook, set `enable_signup = false`, and set the minimum password length to 8. Verify by restarting the stack and checking that a direct sign-up with the publishable key is refused, and that sign-in for a seeded active user returns the claims
- [x] 2.7 Run `supabase test db` and verify all pgTAP tests pass

## 3. First devops script
- [x] 3.1 Create `backend/scripts/create_first_devops.py` per D6: read the root `.env`, prompt with `getpass`, create the confirmed user, insert the profile, and clean up on failure. Verify by running it against the local stack and signing in as the new user
- [x] 3.2 Add `unittest` cases with stubbed HTTP for missing settings, the 2-devops cap error, and the cleanup path. Verify with `python -m unittest discover -s tests` from `backend/`
- [x] 3.3 Document the script, and the SQL fallback for creating a devops account, in `docs/Auth_and_Roles.md`. Verify the documented commands run as written

## 4. Frontend auth core
- [x] 4.1 Add `vitest` as a pinned dev dependency, add a `test` script to `frontend/package.json`, and verify `npm run test -- --run` runs with zero tests passing cleanly
- [x] 4.2 Create `src/lib/supabase.ts` (persisted session, auto-refresh, PKCE, URL detection off, config error when variables are missing) and extend `env.d.ts` if needed. Verify with `npm run typecheck`
- [x] 4.3 Add pure helpers for mapping hook error codes to user messages and for sanitizing the `from` redirect, with vitest cases for each message, unknown errors, `//evil.example`, absolute URLs, and valid internal paths. Verify with `npm run test -- --run`
- [x] 4.4 Implement `AuthProvider` with the `loading`, `signedOut`, `signedIn`, and `blocked` states and the sign-in and sign-out actions. Verify with `npm run typecheck` and a manual sign-in and sign-out against the local stack
- [x] 4.5 Implement the status watcher (60 second check while visible and on focus, profile read, forced refresh on no row). Verify manually by disabling the user in the database while the app is open and observing the disabled message without a reload

## 5. Login page and routing
- [x] 5.1 Build the login page with labelled fields, client-side empty-field checks, an announced error region (`role="alert"`), and focus management, styled with the existing CSS. Verify by keyboard-only sign-in and a screen-reader-friendly markup check
- [x] 5.2 Add the `/login` route and the route guard with the `from` redirect, and wrap the existing routes. Verify that signed-out deep links land on login and return to the requested page after sign-in
- [x] 5.3 Add the header user label and sign-out control, and verify sign-out returns to login, that browser Back does not show protected content, and that a second open tab also returns to login
- [x] 5.4 Walk the manual checklist for every blocked-state message (wrong password, disabled, pending, no profile) against the local stack and verify each shows its own text. Record the results in the PR description

## 6. Run data availability
- [x] 6.1 Add a pure classifier for the snapshot response (404 or non-JSON means no data, other failures mean error, unsupported `schemaVersion` keeps its error) with vitest cases. Verify with `npm run test -- --run`
- [x] 6.2 Update `loadSnapshot` and `SnapshotContext` to return the no-data state, and move the provider inside the guard so nothing is fetched while signed out. Verify in the browser network tab that no `latest.json` request is made on the login page
- [x] 6.3 Split the shell so the header renders without a snapshot, hide snapshot navigation when there is none, and add the "no run data yet" empty state. Verify manually with the file absent, and that sign-out still works from that screen
- [x] 6.4 `git rm frontend/public/data/latest.json`, add it to `.gitignore`, and update the README and `docs/Web_App_Design_Spec.md` wording about the file. Verify `npm run build` succeeds and `frontend/dist` contains no `data/latest.json`

## 7. Hosted rollout and docs
- [x] 7.1 Write `docs/Auth_and_Roles.md` with the role and status model, the full planned role matrix, the phase plan, and the break-glass steps. Verify against the specs for consistency
- [ ] 7.2 Apply migrations to the hosted project with `supabase db push`, apply the hook, sign-up, and password settings (via `supabase config push` or the dashboard), and verify with a direct sign-up attempt using the publishable key being refused
- [ ] 7.3 Run the first devops script against the hosted project, and verify the account can sign in at the deployed or preview URL
- [ ] 7.4 Add the README steps for auth setup (variables, migrations, script, hook), then verify a clean checkout can follow them
- [x] 7.5 Run `npm run build`, `npm run test -- --run`, `supabase test db`, and the backend unit tests, and verify all pass

## 8. CI/CD
- [x] 8.1 Add `.github/workflows/ci.yml` with frontend, backend and database jobs and a gated migration deploy, and document it in the README. Verified locally: the YAML parses, every CLI flag used exists in the pinned CLI (3.0.0), and the lockfile, build-output and change-detection guards behave as intended
- [ ] 8.2 After pushing, add the three repository secrets and the `production` environment, then confirm the first run of all four jobs on GitHub passes (the workflow itself has not been run on GitHub yet)

## Verification notes
- Groups 4 and 5 (browser, local Supabase stack, headless Edge, 36 scripted checks, all passing): signed-out deep link goes to login and returns to the requested page after sign-in; no `latest.json` request while signed out; empty-field messages and focus; wrong password and unknown email give the same message; disabled, pending and no-profile each show their own message and give no session; reload and a second tab keep the session; sign-out in one tab returns the other to login without a reload; Back to a protected page after sign-out shows login; disabling an account while the app is open returns the user to login with the disabled message, and restoring it lets them sign in again; `//evil.example` as the redirect target is ignored; keyboard-only sign-in works. Missing Supabase settings show a configuration error on `/` and `/login`.
- Group 6 (same harness, now 41 checks): after sign-in with no `latest.json`, the app shows "No run data yet" with no error, no navigation to run-data pages, a direct link to `/decision` shows the same empty state, and sign-out works from it. `npm run build` output contains no `data/` folder. The 404 case itself is covered by unit tests only, because the Vite dev server answers a missing file with HTML.
- Not covered by scripted checks: a screen reader pass (the markup uses labels, `aria-invalid`, and an always-present `role="alert"` region, but no assistive technology was run), and the 8 character password minimum (set in `config.toml`, not exercised through the API).

## Workflow follow-up
- Archive the change after review so the three capability specs are added to `openspec/specs/`.
- Start phase 2 (invite flow) as a new change.
