// Invite codes are 8 characters shown as XXXX-XXXX. People type them from a note or a message,
// so entry is forgiving: case, spaces and hyphens do not matter. This must stay in step with the
// database (supabase/migrations/..._invite_check.sql), which normalizes the same way.

export const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0, O, 1, I, L
export const INVITE_CODE_LENGTH = 8;

const NOT_IN_ALPHABET = new RegExp(`[^${INVITE_ALPHABET}]`, "g");

/** Upper-case and drop everything that cannot be part of a code. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(NOT_IN_ALPHABET, "");
}

/** `K7MQ2WXA` becomes `K7MQ-2WXA`. Shorter input gets as far as it can. */
export function formatInviteCode(normalized: string): string {
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

export function isCompleteInviteCode(normalized: string): boolean {
  return normalized.length === INVITE_CODE_LENGTH;
}

/** What to show in the code field as someone types or pastes. */
export function displayInviteCode(input: string): string {
  return formatInviteCode(normalizeInviteCode(input).slice(0, INVITE_CODE_LENGTH));
}
