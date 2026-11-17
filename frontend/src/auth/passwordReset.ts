import { supabase } from "../lib/supabase";
import {
  classifyRequestError, classifySetPasswordError, classifyVerifyError,
  type RequestFailure, type SetPasswordFailure, type VerifyFailure,
} from "../lib/resetErrors";
import { normalizeEmail, normalizeResetCode } from "../lib/resetCode";

// The Supabase calls of the password reset, in the order the pages use them (add-password-reset
// design, D3). Each returns a typed result so the pages deal with layout and focus only.

export type RequestResult = { ok: true } | { ok: false; reason: RequestFailure };
export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };
export type SetPasswordResult = { ok: true } | { ok: false; reason: SetPasswordFailure; detail?: string };

/**
 * Ask for a code. An address with no account gets no email but the same successful answer, so a
 * success here says nothing about whether the account exists.
 */
export async function requestResetCode(email: string): Promise<RequestResult> {
  if (!supabase) return { ok: false, reason: "unknown" };
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
  return error ? { ok: false, reason: classifyRequestError(error) } : { ok: true };
}

/**
 * Check the code. Success creates a session (the sign-in hook runs first, so a disabled or pending
 * account is refused here and gets no session).
 */
export async function verifyResetCode(email: string, code: string): Promise<VerifyResult> {
  if (!supabase) return { ok: false, reason: "unknown" };
  const { error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: normalizeResetCode(code),
    type: "recovery",
  });
  return error ? { ok: false, reason: classifyVerifyError(error) } : { ok: true };
}

/** Set the new password for the session the code created. */
export async function setNewPassword(password: string): Promise<SetPasswordResult> {
  if (!supabase) return { ok: false, reason: "unknown" };
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return { ok: true };
  return { ok: false, reason: classifySetPasswordError(error), detail: error.message };
}

/** A reset suggests the old password is in doubt, so end every other session of this account. */
export async function endOtherSessions(): Promise<void> {
  await supabase?.auth.signOut({ scope: "others" });
}
