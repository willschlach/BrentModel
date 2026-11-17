# Design

## Context

See proposal.md for motivation and scope. Relevant facts:

- The Supabase client is configured with the PKCE flow and `detectSessionInUrl: false` (phase 1), so a reset **link** would return to the app with a code nothing exchanges. The flow here avoids links altogether.
- Supabase's own docs state that `resetPasswordForEmail()` does not reveal whether an account exists (no email is sent when there is none, and the call still returns without error), and that email scanners can pre-fetch and use up a link, recommending a typed one-time code. The email template variable `{{ .Token }}` is that 6-digit code.
- Every session passes through the access token hook, which refuses disabled, pending, and profile-less accounts with a message that starts with `ACCOUNT_DISABLED`, `ACCOUNT_PENDING`, or `ACCOUNT_NO_ROLE`. Verifying a reset code creates a session, so the hook applies to it too.
- The local stack's Mailpit (http://127.0.0.1:54324) catches all email and has an HTTP API, so the flow can be tested end to end without a provider. Local email templates are set in `supabase/config.toml` with HTML files; on the hosted project they are edited in the dashboard.
- The hosted project uses Supabase's built-in mailer, which per the docs only delivers to addresses on the project's team and allows 2 emails per hour. That is why the feature has an off switch.
- `SignUpPage` and `LoginPage` redirect a signed-in visitor to the home page.

## Goals / Non-Goals

**Goals:**
- A person can recover from a forgotten password with nothing but their mailbox.
- Nothing reveals whether an email has an account, and a blocked account cannot use the flow to get in.
- It can be turned off in production and turned on without a code change.

**Non-Goals:**
- Email confirmation, invite emails, in-app notifications, a custom email provider, CAPTCHA, changing a password while signed in, and the "password changed" security email.

## Decisions

### D1. Two public pages, one module
`/forgot-password` and `/reset-password` are public routes beside `/login` and `/signup`. The Supabase calls live in `src/auth/passwordReset.ts` (request a code, verify a code, set the password, end other sessions) and return typed results, so the pages stay about layout and focus. Error classification is separate and pure (`src/lib/resetErrors.ts`) so it can be unit tested without a browser. The forgot-password page passes the email to the reset page in the address query (`/reset-password?email=...`), so the person does not retype it.

### D2. The reset page must not redirect while it is finishing
Verifying the code signs the person in, and the existing pages redirect a signed-in visitor away. The reset page therefore remembers that *it* started the sign-in (a ref set before the verify call) and skips that redirect until the new password is saved. A visitor who is already signed in and opens the page without having entered a code is sent to the home page as elsewhere.

### D3. Order of operations, so a code is not wasted
1. Check the password and its repeat in the browser first (the shared checklist rules), so the common failures happen before the code is used.
2. `verifyOtp({ email, token, type: 'recovery' })`. This is where the hook can refuse a blocked account, and where a wrong or expired code is reported.
3. `updateUser({ password })`. If the **server** rejects the password here (for example its own strength rules, or "same as the old one"), the person is already signed in with a valid session. The page switches to a password-only retry (the code field disappears) instead of asking for a new code, which would not work: the code is single use.
4. On success, `signOut({ scope: 'others' })` ends every other session, since a reset usually means the old password is in doubt, then the person goes to the home page.

> **Spike results (local stack, supabase-js 2.119.0, PKCE client as in the app, emails read from Mailpit).**
>
> | Case | What happens |
> | --- | --- |
> | Request for an existing account | No error. One email, subject "Your password reset code", a 6-digit code and no link anywhere in the text or HTML. |
> | Request for an unknown email | No error and **no email sent**, so the page can give one answer for both. |
> | Asking again immediately | `429`, code `over_email_send_rate_limit`, message "...you can only request this after 0 seconds." (locally `max_frequency` is 1s; the hosted default is 60s). The newest email's code is the valid one. The wording of the app must not repeat the server's number. |
> | Wrong code, expired code (set 2 hours old), reused code | All three give the same: `403`, code `otp_expired`, "Token has expired or is invalid". So the page cannot tell them apart, and says "incorrect or expired". |
> | Correct code | `verifyOtp({ email, token, type: 'recovery' })` returns a session. Its token carries `user_role` and `user_status`, so the hook ran. |
> | New password too short | `422`, code `weak_password`, "Password should be at least 8 characters." |
> | New password equal to the old one | `422`, code `same_password`, "New password should be different from the old password." |
> | Valid new password | `updateUser` succeeds; the old password then fails with `invalid_credentials` and the new one signs in. |
> | `signOut({ scope: 'others' })` after the reset | Succeeds. The other device's `refreshSession` then fails with `refresh_token_not_found`, so its session is gone. |
> | Disabled and pending accounts | **An email is still sent.** Verifying the correct code is refused by the sign-in hook with `403`, code `unknown`, and the message `ACCOUNT_DISABLED: ...` or `ACCOUNT_PENDING: ...`. No session results, `updateUser` then fails with "Auth session missing!", and the password hash is unchanged in the database. |
>
> **Not testable locally**, so assumed until the hosted test: the hourly send limit (`email_sent = 2`) is not enforced by the local mail catcher, and the built-in mailer's refusal of a non-team address. The mapping treats `over_email_send_rate_limit` as "wait" for both the per-address wait and the hourly limit, and treats code `email_address_not_authorized` (or a message containing "not authorized") as "email not available for this address". Both are checked in the hosted rollout task and corrected if they differ.

### D4. Same answer for every email
The forgot-password page shows the same confirmation whatever happens on the server for a missing or existing account, because Supabase itself does not reveal it. The only errors surfaced are about delivery, not accounts: the resend limit and "email not available for this address" (the built-in mailer refusing a non-team address). Neither depends on whether an account exists.

### D5. The feature switch
`src/lib/features.ts` exports `passwordResetEnabled`: the explicit value of `VITE_PASSWORD_RESET_ENABLED` if it is set to `true` or `false`, otherwise `true` in development and `false` in a production build. A small helper keeps that logic in one tested place. A `ResetGate` wrapper component sends the two routes to `/login` when it is off, and `LoginPage` renders the link only when it is on.

### D6. The email and the code lifetime
- Local: `[auth.email.template.recovery]` in `supabase/config.toml` points at `supabase/templates/recovery.html` (the code only, plus a line saying to ignore it if not requested), and `otp_expiry` becomes 600.
- Hosted: the **Reset password** template and the email OTP expiration are dashboard settings. The docs give the exact template text and the checklist. If the template is not updated, the default email contains a link that does not work with this app, so the switch stays off until it is.

### D7. Command-line fallback
`python -m brent_hedge.set_password` follows `remove_user.py`: same settings and safety (shows the target project and the account, asks before changing, `--yes` to skip, plain `http` only for localhost). It finds the profile by email, takes the password with `getpass` (twice, at least 8 characters; `BOOTSTRAP_PASSWORD` is not reused for this, a separate `NEW_PASSWORD` variable allows automation), and sets it with the Auth admin API. It works for any status: setting a password does not enable a disabled account.

### D8. No database change
Everything uses existing Supabase Auth behavior and the existing hook. There is no migration, so nothing is pushed to the hosted database; rollout is dashboard settings and an environment variable.

## Risks / Trade-offs

- [The hosted built-in mailer refuses non-team addresses and allows 2 emails per hour] → Off by default in production; the page reports "not available for this address yet"; the command-line script is the fallback; a custom provider is the real fix and is left to the person who sets one up.
- [The hosted reset template is left as the default, so the email has a dead link instead of a code] → Documented as a required step before turning the switch on, with the exact template text.
- [A 6-digit code is guessable in principle] → Single use, 10 minute life, and Supabase's per-IP limit on verifications; the account must also exist and be active. Residual risk: a determined attacker with many addresses. CAPTCHA is out of scope here.
- [A reset session is a full session] → Inherent to a code that proves mailbox ownership. Checking the password before using the code, and signing out other sessions afterward, limit the damage; the hook still blocks disabled and pending accounts.
- [The server rejects the new password after the code was used] → The page keeps the session and retries the password alone (D3).
- [Emails go to disabled and pending people too] → Accepted; they cannot complete a reset, and see why.
- [The Supabase error codes for rate limiting and for a refused recipient are assumed] → Confirmed by the first spike before the mapping is written.

## Migration Plan

1. Spike on the local stack to confirm the error codes and the session behavior, then add the template and config.
2. Build the module, helpers, and pages; verify with unit tests and a scripted browser pass that reads the code from Mailpit.
3. Add the command-line script and its tests.
4. Update docs. No migration to push.
5. Ship the frontend (commit and push). The switch is off there until you turn it on.
6. To enable on the hosted project: update the Reset password template and the code lifetime in the dashboard, set `VITE_PASSWORD_RESET_ENABLED=true` in Vercel, redeploy, and test with an address on your Supabase team.

Rollback: set the variable back to `false` and redeploy. Nothing else changes.

## Open Questions

None that change the specs or the tasks.
