# Proposal

## Why

Someone who forgets their password has no way back in: today only devops can help, by hand. This is the first piece of phase 4 (see `docs/Auth_and_Roles.md`), and the smallest: a person asks for a reset, receives a 6-digit code by email, and uses it to choose a new password. It uses Supabase's built-in password reset, so no new service is needed.

## What Changes

- Add a **Forgot password** flow, in two steps on two public pages:
  - `/forgot-password`: enter an email. The page always answers the same way ("if an account exists for that email, a code has been sent"), whether or not there is an account, and moves on to step two.
  - `/reset-password`: enter the email, the 6-digit code, and a new password twice, with the same live checklist as sign-up. A correct code signs the person in and sets the new password; their other sessions are signed out.
- Reset by **typed code, not a link**. Email scanners can pre-fetch and use up a reset link, and the app's client is set up for a different link style. The reset email carries the code only.
- A person whose account is disabled, pending, or without a profile cannot complete a reset: they see the same message as at sign-in, and the password is unchanged.
- A **"Send a new code"** action, with a clear message when Supabase's resend limit applies.
- A **feature switch**, `VITE_PASSWORD_RESET_ENABLED`: on in local development, off in production builds until set to `true`. When off, the sign-in page shows no "Forgot password?" link and the two addresses go to the sign-in page. This is the "disabled for now" option, because Supabase's built-in mailer only delivers to your project team's addresses and only 2 emails per hour. If it refuses an address, the page says email is not available for it yet instead of failing silently.
- A custom **reset email template** (a code, no link) and a shorter code lifetime, 10 minutes. Locally these live in `supabase/config.toml` and a template file; on the hosted project they are dashboard settings, which the docs will spell out.
- A command-line fallback, `python -m brent_hedge.set_password --email <email>`, for devops to set a password directly while email is unavailable. Like the other scripts, it shows the target project and asks before changing anything.
- No database change and no new dependency.

## Capabilities

### New Capabilities
- `password-reset`: requesting a code, the reset email, completing the reset, the cases that are refused, the feature switch, the command-line fallback, and accessibility.

### Modified Capabilities
- `user-authentication`: the sign-in page offers "Forgot password?" when the reset is enabled.

## Impact

- Frontend: two new public pages and routes, a small reset module (`src/auth/passwordReset.ts`), error mapping with unit tests, a feature-switch helper, a link on the sign-in page, and the new environment variable in `env.d.ts`.
- Supabase: the local `config.toml` (recovery template, code lifetime) and a new `supabase/templates/recovery.html`. **No migration**, so nothing to push. On the hosted project: the Reset password template and code lifetime in the dashboard.
- Vercel: `VITE_PASSWORD_RESET_ENABLED=true` when you are ready to turn it on.
- Backend: one new script and its unit tests.
- Docs: `docs/Auth_and_Roles.md` and the README.

## Out of Scope

- Email confirmation of new accounts (the next phase 4 change), invite emails, in-app notifications, and a custom email provider.
- Changing a password while signed in, and the "password was changed" security email.
- CAPTCHA, and account lockout beyond Supabase's own rate limits.
