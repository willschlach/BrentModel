// Classifies and words the errors of the password reset flow. The codes come from the spike recorded
// in the add-password-reset design (openspec/changes), measured against the local Auth service:
//   asking too soon          429  over_email_send_rate_limit
//   wrong, expired, reused   403  otp_expired        (all three look the same)
//   weak new password        422  weak_password
//   same as the old one      422  same_password
//   blocked account          403  code "unknown", message "ACCOUNT_DISABLED: ..." / "ACCOUNT_PENDING: ..."
// The refusal of a non-team address by the built-in mailer cannot be produced locally, so
// `email_address_not_authorized` is assumed and checked on the hosted project.

import { blockReasonFromMessage, messageFor, type BlockReason } from "./authErrors";

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

// ---- asking for a code

export type RequestFailure = "rate_limited" | "email_unavailable" | "unknown";

export function classifyRequestError(error: ErrorLike | null | undefined): RequestFailure {
  if (!error) return "unknown";
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429) {
    return "rate_limited";
  }
  const text = (error.message ?? "").toLowerCase();
  if (error.code === "email_address_not_authorized" || text.includes("not authorized")) return "email_unavailable";
  return "unknown";
}

const REQUEST_MESSAGES: Record<RequestFailure, string> = {
  rate_limited: "Please wait a minute before asking for another code.",
  email_unavailable: "Email is not available for this address yet. Ask an administrator to reset your password.",
  unknown: "Could not send the code. Check your connection and try again.",
};

export const requestMessage = (f: RequestFailure): string => REQUEST_MESSAGES[f];

// ---- checking the code

export type VerifyFailure = BlockReason | "bad_code" | "rate_limited" | "unknown";

export function classifyVerifyError(error: ErrorLike | null | undefined): VerifyFailure {
  if (!error) return "unknown";
  // A blocked account is refused by the sign-in hook, after the code itself was accepted.
  const blocked = blockReasonFromMessage(error.message);
  if (blocked) return blocked;
  if (error.code === "otp_expired" || error.code === "otp_disabled") return "bad_code";
  if (error.code === "over_request_rate_limit" || error.status === 429) return "rate_limited";
  return "unknown";
}

const VERIFY_MESSAGES = {
  bad_code: "That code is incorrect or has expired. Check it, or send a new code.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  unknown: "Could not check the code. Check your connection and try again.",
} as const;

export function verifyMessage(f: VerifyFailure): string {
  if (f === "disabled" || f === "pending" || f === "no_role") return messageFor(f);
  return VERIFY_MESSAGES[f];
}

// ---- saving the new password

export type SetPasswordFailure = "weak" | "same" | "session_lost" | "unknown";

export function classifySetPasswordError(error: ErrorLike | null | undefined): SetPasswordFailure {
  if (!error) return "unknown";
  if (error.code === "weak_password") return "weak";
  if (error.code === "same_password") return "same";
  const text = (error.message ?? "").toLowerCase();
  if (error.name === "AuthSessionMissingError" || text.includes("session missing") || text.includes("not authenticated")) {
    return "session_lost";
  }
  return "unknown";
}

const SET_PASSWORD_MESSAGES: Record<SetPasswordFailure, string> = {
  weak: "That password is not strong enough. Try a longer one.",
  same: "Choose a password that is different from your old one.",
  session_lost: "Your reset session has ended. Ask for a new code.",
  unknown: "Could not save the new password. Try again.",
};

/** For a weak password the server's own wording is more specific than ours, so prefer it. */
export function setPasswordMessage(f: SetPasswordFailure, serverMessage?: string): string {
  if (f === "weak" && serverMessage) return serverMessage;
  return SET_PASSWORD_MESSAGES[f];
}
