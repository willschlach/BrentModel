// The password reset code is 6 digits, typed or pasted from an email. Pasted codes often carry
// spaces or a hyphen ("123 456"), so everything that is not a digit is ignored.

export const RESET_CODE_LENGTH = 6;

export function normalizeResetCode(input: string): string {
  return input.replace(/\D/g, "");
}

export function isCompleteResetCode(normalized: string): boolean {
  return normalized.length === RESET_CODE_LENGTH;
}

/** What to show in the field while typing or pasting: digits only, at most 6. */
export function displayResetCode(input: string): string {
  return normalizeResetCode(input).slice(0, RESET_CODE_LENGTH);
}

/** Emails are compared case-insensitively by Auth; send them trimmed and lower case. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}
