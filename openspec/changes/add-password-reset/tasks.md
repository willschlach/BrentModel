# Tasks

## 1. Spike and local email setup
- [ ] 1.1 Spike on the local stack with Mailpit: request a reset for an account, read the email, and record the exact error `status` and `code` for each of: wrong code, expired or reused code, asking again too soon, a blocked (disabled and pending) account at verify, a weak password at `updateUser`, and the same password as before. Confirm `verifyOtp` with `type: 'recovery'` returns a session, that `signOut({ scope: 'others' })` ends another session, and that an unknown email gives no error. Write the findings under Decision D3 in `design.md` and fix the codes the mapping will use
- [ ] 1.2 Add `supabase/templates/recovery.html`, the `[auth.email.template.recovery]` entry, and `otp_expiry = 600` to `supabase/config.toml`, and restart the stack. Verify with Mailpit that the email contains a 6-digit code and no link

## 2. Frontend foundations
- [ ] 2.1 Add `src/lib/features.ts` (Decision D5), the new variable in `env.d.ts`, and vitest cases for: explicit true, explicit false, unset in development, unset in production. Verify with `npm run test -- --run`
- [ ] 2.2 Add `src/lib/resetErrors.ts` classifying and wording request, verify, and set-password errors, with vitest cases for every code recorded in the spike and for unknown errors. Verify with `npm run test -- --run`
- [ ] 2.3 Add `src/auth/passwordReset.ts` (request a code, verify a code, set the password, end other sessions) returning typed results. Verify with `npm run typecheck` and in the browser pass (task 5.1)

## 3. Pages and routes
- [ ] 3.1 Build `ForgotPasswordPage`: labelled email field, client check for empty, the same-answer confirmation, delivery error wording, focus and announced errors, then on to the reset page with the email in the address. Verify in the browser pass
- [ ] 3.2 Build `ResetPasswordPage`: email, code (numeric, one-time-code autofill, accepts a paste), new password twice with the shared checklist, the order of operations in Decision D3 including password-only retry, "Send a new code", no premature redirect (Decision D2), and the blocked-account messages. Verify in the browser pass
- [ ] 3.3 Add the two public routes behind a `ResetGate`, and the "Forgot password?" link on `LoginPage` when enabled. Verify that with the switch off the link is absent and both addresses go to the sign-in page, and with it on they work

## 4. Command-line fallback
- [ ] 4.1 Add `python -m brent_hedge.set_password` (Decision D7) and its unit tests: unknown email, declined prompt, short password, mismatch, success path, missing settings. Verify with `python -m unittest discover -s tests` from `backend/`
- [ ] 4.2 Run the script against the local stack and sign in with the new password. Verify it works for an active account and does not enable a disabled one

## 5. Scripted browser pass (local stack, Mailpit, headless Edge)
- [ ] 5.1 Happy path: forgot, code from Mailpit, new password, signed in; the old password fails and the new one works; another session was signed out. Also: wrong code, reused code, resend, the confirmation text identical for a real and a made-up email, a disabled and a pending account see their messages and keep their password, a weak password at the server leaves the page in password-only retry, the checklist and keyboard use, and the switch off (link hidden, both addresses redirect). Record the results under Verification notes

## 6. Docs, rollout, and final checks
- [ ] 6.1 Update `docs/Auth_and_Roles.md`: the flow, the switch, the exact hosted template text and code lifetime, the mailer limits, enabling steps, and the script. Update the README. Verify every command and SQL line as written
- [ ] 6.2 Run `npm run build`, `npm run test -- --run`, `supabase test db`, and the backend unit tests. Verify all pass
- [ ] 6.3 Ship the frontend and turn it on in the hosted project: commit and push, update the Reset password template and code lifetime in the dashboard, set `VITE_PASSWORD_RESET_ENABLED=true` in Vercel, and test with an address on the Supabase team. Ask before doing anything on the live project

## Workflow follow-up
- Archive this change, then start the next phase 4 change (email confirmation).
