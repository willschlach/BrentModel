# Tasks

## 1. Spike and local email setup
- [x] 1.1 Spike on the local stack with Mailpit: request a reset for an account, read the email, and record the exact error `status` and `code` for each of: wrong code, expired or reused code, asking again too soon, a blocked (disabled and pending) account at verify, a weak password at `updateUser`, and the same password as before. Confirm `verifyOtp` with `type: 'recovery'` returns a session, that `signOut({ scope: 'others' })` ends another session, and that an unknown email gives no error. Write the findings under Decision D3 in `design.md` and fix the codes the mapping will use
- [x] 1.2 Add `supabase/templates/recovery.html`, the `[auth.email.template.recovery]` entry, and `otp_expiry = 600` to `supabase/config.toml`, and restart the stack. Verify with Mailpit that the email contains a 6-digit code and no link

## 2. Frontend foundations
- [x] 2.1 Add `src/lib/features.ts` (Decision D5), the new variable in `env.d.ts`, and vitest cases for: explicit true, explicit false, unset in development, unset in production. Verify with `npm run test -- --run`
- [x] 2.2 Add `src/lib/resetErrors.ts` classifying and wording request, verify, and set-password errors, with vitest cases for every code recorded in the spike and for unknown errors. Verify with `npm run test -- --run`
- [x] 2.3 Add `src/auth/passwordReset.ts` (request a code, verify a code, set the password, end other sessions) returning typed results. Verify with `npm run typecheck` and in the browser pass (task 5.1)

## 3. Pages and routes
- [x] 3.1 Build `ForgotPasswordPage`: labelled email field, client check for empty, the same-answer confirmation, delivery error wording, focus and announced errors, then on to the reset page with the email in the address. Verify in the browser pass
- [x] 3.2 Build `ResetPasswordPage`: email, code (numeric, one-time-code autofill, accepts a paste), new password twice with the shared checklist, the order of operations in Decision D3 including password-only retry, "Send a new code", no premature redirect (Decision D2), and the blocked-account messages. Verify in the browser pass
- [x] 3.3 Add the two public routes behind a `ResetGate`, and the "Forgot password?" link on `LoginPage` when enabled. Verify that with the switch off the link is absent and both addresses go to the sign-in page, and with it on they work

## 4. Command-line fallback
- [x] 4.1 Add `python -m brent_hedge.set_password` (Decision D7) and its unit tests: unknown email, declined prompt, short password, mismatch, success path, missing settings. Verify with `python -m unittest discover -s tests` from `backend/`
- [x] 4.2 Run the script against the local stack and sign in with the new password. Verify it works for an active account and does not enable a disabled one

## 5. Scripted browser pass (local stack, Mailpit, headless Edge)
- [x] 5.1 Happy path: forgot, code from Mailpit, new password, signed in; the old password fails and the new one works; another session was signed out. Also: wrong code, reused code, resend, the confirmation text identical for a real and a made-up email, a disabled and a pending account see their messages and keep their password, a weak password at the server leaves the page in password-only retry, the checklist and keyboard use, and the switch off (link hidden, both addresses redirect). Record the results under Verification notes

## 6. Docs, rollout, and final checks
- [x] 6.1 Update `docs/Auth_and_Roles.md`: the flow, the switch, the exact hosted template text and code lifetime, the mailer limits, enabling steps, and the script. Update the README. Verify every command and SQL line as written
- [x] 6.2 Run `npm run build`, `npm run test -- --run`, `supabase test db`, and the backend unit tests. Verify all pass
- [ ] 6.3 Ship the frontend and turn it on in the hosted project: commit and push, update the Reset password template and code lifetime in the dashboard, set `VITE_PASSWORD_RESET_ENABLED=true` in Vercel, and test with an address on the Supabase team. Ask before doing anything on the live project

## Verification notes
- Spike (local stack, Mailpit): see Decision D3 in `design.md` for every error code recorded. The email contains a 6-digit code and no link; an unknown address gets no email and no error.
- Browser (headless Edge, local stack, codes read from Mailpit), switch on, 45 checks, all passing: the sign-in page shows "Forgot password?" and carries the typed email over; an empty email is asked for with focus on it; a made-up and a real address get **identical** confirmation wording, and only the real one gets an email; "Enter the code" opens the reset page with the email filled in; empty email, short code, short password, and mismatched passwords are caught in the browser with focus on the right field, and the code field keeps digits only (at most 6) and accepts "123 456"; a wrong code says "incorrect or has expired", focuses the code, and leaves the password and session untouched; "Send a new code" confirms without revealing whether an account exists, and asking again inside the server's wait says to wait; the correct code signs in and lands in the app, the old password fails, the new one works, and the other device's refresh token is dead; a used code is refused; a disabled and a pending account each get the same message as signing in, stay on the page without a session, and keep their password hash; the old password reused as the new one is rejected by the server, the page switches to password-only (no email or code field) without bouncing to the app, and a different password then finishes the reset with no new code; a signed-in visitor opening either page lands in the app; every field has a label, the code field asks for numeric input and one-time-code autofill, the error region is an alert, and a whole reset works with the keyboard alone.
- Browser, switch off: no link, and both addresses go to the sign-in page (3 checks).
- Found and fixed during the pass: once "Check your email" showed there was no way back to try a different address, so a "Use a different email" action was added. Two of my own test steps were wrong (a selector that could hit the paragraph instead of the button, and a wait longer than the server's limit) and were corrected in the test, not the app.
- The production default itself, checked on the real built bundle served by `vite preview` with the variable unset: no "Forgot password?" link, the sign-up link still present, and both reset addresses go to the sign-in page.
- Command-line fallback, against the local stack: sets an active account's password (the old one stops working, the new one signs in); on a disabled account it changes the password hash but not the status, and says the account is still disabled (the first version wrongly said it could sign in; fixed and tested); refuses a short password and an unknown email; declining changes nothing. 11 unit tests.
- Not verifiable locally: the hosted mailer's hourly limit and its refusal of non-team addresses. Both are in the hosted rollout task.

## Workflow follow-up
- Archive this change, then start the next phase 4 change (email confirmation).
