// Turns Supabase Auth errors into the reasons the login page explains to people.
//
// When the access token hook refuses a token, supabase-js reports status 403, code "unknown",
// and the hook's message, which starts with a stable code (see the add-auth-foundation design,
// D2). So the code is read from the message prefix, not from error.code.

export type BlockReason = "disabled" | "pending" | "no_role";
export type SignInFailure = BlockReason | "invalid_credentials" | "unknown";

const PREFIXES: ReadonlyArray<readonly [string, BlockReason]> = [
  ["ACCOUNT_DISABLED", "disabled"],
  ["ACCOUNT_PENDING", "pending"],
  ["ACCOUNT_NO_ROLE", "no_role"],
];

interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

export function blockReasonFromMessage(message: string | undefined): BlockReason | null {
  const text = message ?? "";
  for (const [prefix, reason] of PREFIXES) {
    if (text.startsWith(prefix)) return reason;
  }
  return null;
}

export function classifySignInError(error: AuthErrorLike | null | undefined): SignInFailure {
  if (!error) return "unknown";
  const blocked = blockReasonFromMessage(error.message);
  if (blocked) return blocked;
  if (error.code === "invalid_credentials") return "invalid_credentials";
  return "unknown";
}

const MESSAGES: Record<SignInFailure, string> = {
  invalid_credentials: "Incorrect email or password.",
  disabled: "This account has been disabled. Contact an administrator.",
  pending: "This account is awaiting approval.",
  no_role: "This account has no access. Contact an administrator.",
  unknown: "Could not sign in. Check your connection and try again.",
};

export function messageFor(reason: SignInFailure): string {
  return MESSAGES[reason];
}
