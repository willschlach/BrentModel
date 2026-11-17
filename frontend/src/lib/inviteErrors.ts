// Messages for the sign-up page and the Invites screen.
//
// Sign-up rejections come from the database as `CODE: text` (see the archived add-invite-signup design in openspec/changes/archive,
// D5/D6). supabase-js reports them with status 400 or 403, code "unknown", and that text as the
// message, so the stable CODE is read from the message prefix, as for the sign-in errors.

import { blockReasonFromMessage } from "./authErrors";

export type SignUpFailure =
  | "no_invite"
  | "wrong_code"
  | "expired"
  | "used"
  | "revoked"
  | "locked"
  | "invalid"
  | "already_registered"
  | "weak_password"
  | "signups_closed"
  | "unknown";

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

const SIGNUP_PREFIXES: ReadonlyArray<readonly [string, SignUpFailure]> = [
  ["INVITE_NO_INVITE", "no_invite"],
  ["INVITE_WRONG_CODE", "wrong_code"],
  ["INVITE_EXPIRED", "expired"],
  ["INVITE_USED", "used"],
  ["INVITE_REVOKED", "revoked"],
  ["INVITE_LOCKED", "locked"],
  ["INVITE_INVALID", "invalid"],
];

/**
 * A pending account is created, but Auth cannot issue it a session, so it reports the sign-in
 * refusal (ACCOUNT_PENDING). That is the success case for "no code": the request was submitted.
 */
export function classifySignUpError(error: ErrorLike | null | undefined): SignUpFailure | "pending" {
  if (!error) return "unknown";
  if (blockReasonFromMessage(error.message) === "pending") return "pending";
  const text = error.message ?? "";
  for (const [prefix, reason] of SIGNUP_PREFIXES) {
    if (text.startsWith(prefix)) return reason;
  }
  if (error.code === "user_already_exists") return "already_registered";
  if (error.code === "weak_password") return "weak_password";
  // Sign-ups are switched off in the project settings (the default before the dashboard is set up).
  if (error.code === "signup_disabled") return "signups_closed";
  return "unknown";
}

const SIGNUP_MESSAGES: Record<SignUpFailure, string> = {
  no_invite: "There is no invite for this email address.",
  wrong_code: "That invite code is incorrect.",
  expired: "This invite has expired. Ask for a new code.",
  used: "This invite has already been used.",
  revoked: "This invite was revoked. Ask for a new code.",
  locked: "This invite is locked after too many wrong attempts. Ask for a new code.",
  invalid: "This invite code cannot be used.",
  already_registered: "This email is already registered.",
  weak_password: "The password must be at least 8 characters.",
  signups_closed: "Sign-up is not open right now. Ask an administrator.",
  unknown: "Could not sign up. Check your connection and try again.",
};

export function signUpMessage(reason: SignUpFailure): string {
  return SIGNUP_MESSAGES[reason];
}

// ---- Errors from the invite functions (create, revoke, regenerate)

const ACTION_MESSAGES: Record<string, string> = {
  INVITE_FORBIDDEN: "You are not allowed to do that.",
  INVITE_BAD_ROLE: "Invites can only be for the member or admin role.",
  INVITE_BAD_EMAIL: "Enter a valid email address.",
  INVITE_ACCOUNT_EXISTS: "An account already exists for this email.",
  INVITE_ACCOUNT_DISABLED: "This email belongs to a disabled account. Restore that account instead of inviting.",
  INVITE_NOT_FOUND: "That invite no longer exists.",
  INVITE_ALREADY_USED: "This invite has already been used.",
  INVITE_ALREADY_REVOKED: "This invite is already revoked.",
  INVITE_NOT_EDITABLE: "This invite is revoked. Regenerate it to use it again.",
};

const UNKNOWN_ACTION = "Something went wrong. Try again.";

/** Message for an error returned by one of the invite functions. */
export function inviteActionMessage(error: ErrorLike | null | undefined): string {
  const text = error?.message ?? "";
  const code = text.split(":", 1)[0];
  // A permission failure from the database itself (no execute right, no policy) has no prefix.
  if (!(code in ACTION_MESSAGES) && error?.code === "42501") return ACTION_MESSAGES.INVITE_FORBIDDEN;
  return ACTION_MESSAGES[code] ?? UNKNOWN_ACTION;
}
