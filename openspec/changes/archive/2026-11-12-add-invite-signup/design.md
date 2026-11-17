# Design

## Context

See proposal.md for motivation and scope. This builds on phase 1 (`add-auth-foundation`), whose pieces matter here:

- `public.profiles` with enums `app_role` and `account_status`, RLS, and the rules trigger `profiles_enforce_rules`. That trigger skips the actor rules when `auth.uid()` is null (privileged callers) but always applies the devops headcount limits.
- `private.actor_role()` returns the caller's role only when their profile is `active`. Policies and triggers use it, so decisions follow the live profile and not the token.
- The custom access token hook refuses tokens for `disabled`, `pending`, and profile-less accounts with a message that starts with a stable code (`ACCOUNT_DISABLED`, `ACCOUNT_PENDING`, `ACCOUNT_NO_ROLE`). supabase-js reports it as `status 403`, `code 'unknown'`, with the hook's message, so the app reads the code from the message prefix.
- `bootstrap_devops` creates the auth user through the Auth admin API and then **inserts** the profile. The three database test files insert `auth.users` rows and then **insert** profiles.
- `frontend/src/App.tsx` renders every page under one `Root` route whose children render only when run data exists. The header navigation exists only with run data.
- Hosted settings today: sign-ups off, and `mailer_autoconfirm` false (email confirmation required). `config.toml` has sign-ups off and confirmation off.

What the Supabase docs establish for the before-user-created hook (Postgres function): it receives `user` (with `email` and `user_metadata`) and `metadata` (with `ip_address`), and returns `{}` to allow or `{"error": {"http_code", "message"}}` to reject. It runs before the user row exists.

## Goals / Non-Goals

**Goals:**
- Sign-up outcomes (active, pending, rejected) are decided in the database, once, with two independent checks.
- A rejected or failed sign-up never uses up a code, and a code can create at most one account.
- Phase 3 can add approval and admin screens without reshaping the schema.

**Non-Goals:**
- Approving or rejecting pending accounts in the app (phase 3), email delivery, email confirmation, forgot password, CAPTCHA, and invites for devops accounts.
- Verifying that a pending person owns their email. The "email not verified" label arrives with the approvals screen.

## Decisions

### D1. Invites live in one table, with status derived
`public.invites`: `id`, `email` (stored lower case and trimmed), `role` (check: `member` or `admin`), `code_hash`, `created_by` (references `profiles`, set null on delete), `created_at`, `expires_at` (default now plus 24 hours), `used_at`, `used_by`, `revoked_at`, `revoked_by`, `failed_attempts` (default 0).

- A partial unique index allows at most one *live* invite per email: `used_at is null and revoked_at is null`. Creating a new invite revokes the old live one first.
- Status is computed in one place, a view `public.invite_list` created with `security_invoker = true` (so RLS applies to the caller), using the precedence in the spec: used, revoked, locked (`failed_attempts >= 10`), expired, active. The view also joins the creator's email for display. The same expression is used by the checking function, so the two cannot drift.
- Alternative: store a status column. Rejected: it goes stale when time passes.

### D2. Code format and hashing
- 8 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31 characters; no 0, O, 1, I, L), drawn with `gen_random_bytes` and rejection sampling so every character is equally likely. That is about 39.6 bits. Displayed as `XXXX-XXXX`; input is normalized by upper-casing and removing everything that is not in the alphabet.
- Stored with `crypt(code, gen_salt('bf', 8))` from `pgcrypto`. A short code makes the hash the only thing between a leaked table and usable codes, so a slow salted hash is chosen over SHA-256, which a 40-bit space would not survive.
- Alternative: longer codes. Rejected by you for typing ease; the lock, the 24 hour life, the email binding, and bcrypt compensate (see Risks).

### D3. Creating, revoking, and regenerating are database functions
`public.create_invite(email, role)`, `public.revoke_invite(invite_id)`, and `public.regenerate_invite(invite_id)` are `security definer`, `search_path = ''`, executable by `authenticated` only (revoked from `public` and `anon`). Each starts by reading the caller's live role with `private.actor_role()`.

- Create and regenerate need devops or admin; role is `member` or `admin`. Revoke and regenerate: devops on any invite, admin on their own.
- Create takes a per-email advisory lock, then: normalizes the email, refuses an email that has an account (a distinct message for a disabled one), revokes the live invite, generates the code, stores the hash, and returns the plaintext once.
- Errors use `raise exception` with a stable prefix (`INVITE_ACCOUNT_EXISTS`, `INVITE_ACCOUNT_DISABLED`, `INVITE_FORBIDDEN`, and so on) so the screen can show a specific message.
- No client has insert, update, or delete on `invites`. Select: devops all rows, others only rows they created.
- Alternative: an Edge Function. Rejected: the database already knows the live role, and there is no mail to send.

### D4. One checking function used by both gates
`private.check_invite(email, code, record_failure)` finds the invite for the email: the live one if there is one, otherwise the most recent, otherwise none. It returns the invite id and one of `ok`, `no_invite`, `wrong_code`, `expired`, `used`, `revoked`, `locked`. State is checked before the code, so a locked or expired invite is reported as such even with the correct code. The code is compared with `crypt` against the stored hash. Only `wrong_code` counts as a failed attempt.

### D5. Gate 1: the before-user-created hook
`public.hook_before_user_created(event)` reads `user.email` and `user.user_metadata.invite_code`. No code (or an empty one) returns `{}`. A code runs `check_invite(..., record_failure := true)`; anything but `ok` returns `{"error": {"http_code": 400, "message": "<CODE>: <text>"}}` with codes `INVITE_NO_INVITE`, `INVITE_WRONG_CODE`, `INVITE_EXPIRED`, `INVITE_USED`, `INVITE_REVOKED`, `INVITE_LOCKED`. Grants follow the Supabase pattern: execute for `supabase_auth_admin` only. The hook function calls the `security definer` check function, because the Auth role must not be able to touch `invites` directly.

### D6. Gate 2: a trigger on `auth.users` that creates the profile
`private.handle_new_user()` is a `security definer` **after insert** trigger on `auth.users`. It reads only `raw_user_meta_data ->> 'invite_code'` and ignores every other metadata key.

- Code present: `check_invite` without recording, and anything but `ok` raises, which rolls back the user creation. If `ok`, one `update ... where used_at is null and revoked_at is null and failed_attempts < 10 and expires_at > now() returning` consumes the invite. If it updates no row, the trigger raises. Row locking means that of two simultaneous sign-ups only one wins. Then the profile is inserted as `active` with the invite's role.
- No code: the profile is inserted as `member` / `pending`.
- Last, the trigger removes `invite_code` from the stored metadata so the code is not left readable.
- It is an after-insert trigger because `profiles.id` references `auth.users`.
- Messages that reach the browser from this trigger are generic ("database error saving new user"); the clear messages come from gate 1. If gate 1 is off, gate 2 still blocks.

### D7. Failed-attempt counting depends on one assumption
> **Spike result (local stack).** A hook that incremented a counter row and then returned an error response left the counter incremented after each of three rejected sign-ups, and created no users. So a write made inside the hook **survives** a rejection, and the attempt cap works as designed with no `dblink`. The client sees `status 400`, `code 'unknown'`, and the hook's message, so the app reads the code from the message prefix, as in phase 1.

The hook returns an error response instead of raising, so my expectation is that its write to `failed_attempts` commits. That is not documented, so the first task is a spike. If the write is rolled back with the error, the fallback is a committed side channel (for example `dblink` back to the same database) or, failing that, dropping the cap and relying on Supabase's per-IP limits. I will stop and ask you before taking the second option.

### D8. Phase 1 pieces that must change
> **Spike result.** The `postgres` role can create a trigger on `auth.users` but cannot `alter table auth.users disable trigger` (the table is owned by `supabase_auth_admin`: "must be owner of table users"). It *can* run `set local session_replication_role = replica`, which suppresses the trigger for the fixture inserts into `auth.users`. The test fixtures therefore stay as they are, with only the `auth.users` insert wrapped in `replica` and then `origin`. Consequence for recovery: the sign-up trigger cannot be disabled from the SQL editor; the break-glass is to switch sign-ups off in the dashboard and replace the trigger function with a fixed version.

- **The bootstrap script.** The Auth admin API creates a user, which now fires the trigger and creates a pending member profile. The script therefore updates that profile (`PATCH` filtered by id, asking for the updated row back) to `devops` / `active`, and cleans up the user if no row comes back or the update fails. The pre-check and the cap stay.
- **Test fixtures.** Tests that insert `auth.users` and then profiles would now collide with the trigger. The preferred fix is disabling the trigger inside each test transaction. If the `postgres` role may not alter triggers on `auth.users`, the fixtures switch to upserts. The spike settles which.
- **Other phase 1 behavior is unchanged**, including the rules trigger and the headcount limits (invites cannot name `devops`).

### D9. Frontend structure
> **Spike result (local stack, confirmation off).** A sign-up that creates a *pending* profile returns an error: `status 403`, `code 'unknown'`, message `ACCOUNT_PENDING: ...`, with no user and no session in the response, **but the account is created**. A sign-up that creates an *active* profile returns both a user and a session. A duplicate email returns `422`, `code 'user_already_exists'`, `User already registered`. A too-short password returns `422`, `code 'weak_password'`, and creates no account. So the app treats exactly the `ACCOUNT_PENDING` error as "request submitted", and password strength is rejected by Auth without creating an account.

- `/signup` is a public route beside `/login`. `/invites` is its own route under the guard and a new `RequireRole` wrapper that redirects non-devops to the home page. It is **not** a child of `Root`, because `Root` renders its children only when run data exists, and the Invites screen must work with none.
- The page frame and header move out of `App.tsx` so `Root` and the Invites route share them. The header shows an "Invites" link for devops whether or not run data exists; the run-data links still appear only with a snapshot.
- `AuthContext` gains `signUp(email, password, code)` returning `signedIn`, `submitted`, or a failure reason. After sign-up with confirmation off, a valid code returns a session. A pending account gets no token, so Auth reports the hook's `ACCOUNT_PENDING` refusal; the app treats that exact error as `submitted`. A spike confirms the real behavior.
- New pure helpers with unit tests: `inviteCode.ts` (normalize, format, validate) and `inviteErrors.ts` (prefix to message, for both the sign-up and the invite functions).
- The Invites page holds the new code only in component state, shows it once with a warning, and clears it on any navigation or when another invite is created.

### D10. Settings and rollout order
`config.toml` gets `enable_signup = true` and the `before_user_created` hook (`pg-functions://postgres/public/hook_before_user_created`). On the hosted project, in this order and only after the migrations are deployed: set the Before User Created hook, turn Confirm email off, and turn "Allow new users to sign up" on **last**. Rollback is the reverse, with sign-ups off first.

### D11. One invite per email, a "disabled" status, and editable roles (added after the hosted rollout)
Found when testing on the hosted project: inviting, revoking, and inviting the same email again left three rows (revoked, revoked, active), and it was hard to tell what a sign-up was checking. This changes D1, D3, and D4:

- `invites.email` is **unique across all rows** (the earlier partial index on live invites is replaced). Inviting an email again is an upsert on that row: new code hash, role, creator, a new 24 hour expiry, attempts reset, revocation cleared. A used invite is never overwritten: the email has an account, which `create_invite` already refuses.
- `check_invite` therefore looks at one row. The "most recent" fallback is gone.
- A new status `disabled` sits first in the precedence: a used invite whose `used_by` account is disabled. It needs the account's status, so `invite_status` reads `profiles` as the caller (row level security applies in the list; the sign-up checks call it as the owner). A sign-up against a disabled account's invite is told it is "used".
- `update_invite_role(invite, role)` changes the role of an unused, unrevoked invite (devops any, admin their own), leaving the code and expiry alone. The Invites screen shows it as a dropdown.
- The migration also tidies existing data before adding the unique index: used invites whose account no longer exists are dropped, and one row is kept per email (the used one, else the live one, else the newest). This deletes history rows on the hosted project; they have no further use.
- The Invites screen guards against a fast double click starting two requests.
- The sequence reported on the hosted project (invite, revoke, invite, then sign-up saying "revoked") did **not** reproduce on the local stack under the old model: the live invite's code signed up, and the revoked invite's code was reported as "incorrect". The cause on the hosted project is therefore unconfirmed. Under the new model that sequence cannot produce several rows, and a sign-up can report "revoked" only when the one invite is revoked.

## Risks / Trade-offs

- [Open sign-up with no email confirmation lets anyone create a pending account, including under someone else's email] → Accepted by you (option A). Mitigations: pending accounts cannot sign in or read data; the approvals screen will label requests "email not verified"; docs tell approvers to vet identities out of band; the SQL cleanup and the dashboard sign-up switch are documented.
- [Bots filling the pending list, with no screen to clear it until phase 3] → Supabase's per-IP rate limits, a documented SQL cleanup, and the dashboard switch. CAPTCHA is not included; revisit if it happens.
- [A 40-bit code is guessable in principle] → Bound to one email, 24 hour life, single use, locks after 10 failures, bcrypt hashing. Residual risk: someone who knows an invitee's email can lock that invite on purpose; devops regenerates it.
- [The trigger fails and blocks every new account, including the bootstrap script] → Tested in pgTAP; the sign-up switch in the dashboard stops the flood while a fix migration goes out.
- [The hook fails] → Remove it in the dashboard; gate 2 still enforces, with generic error text.
- [Messages reveal that an email has an invite, or an account] → Accepted for this small, known user base.
- [Changing phase 1 test fixtures and the bootstrap script risks regressions] → Existing tests keep running in CI, and the bootstrap script's unit tests are updated with it.
- [Archiving: the modified specs cannot be archived until phase 1 is archived] → Archive phase 1 first (tracked in the tasks).

## Migration Plan

1. Run the spikes locally, then the migrations and database tests.
2. Build and verify the frontend against the local stack with the same browser checks used in phase 1.
3. Deploy migrations (CI or `supabase db push`). With sign-ups still off, this changes nothing for users.
4. In the hosted dashboard: Before User Created hook, then Confirm email off, then Allow new users to sign up on.
5. Verify end to end on the hosted project: create an invite, sign up with it, sign up without a code and check the pending message, and try a wrong code.

Rollback: turn sign-ups off, remove the before-user-created hook, redeploy the previous frontend. The migrations are additive; the `invites` table and trigger can stay.

## Open Questions

- Do we want CAPTCHA on sign-up before this is exposed beyond a known group of people? It does not change the specs or the tasks here; it can be added later.
