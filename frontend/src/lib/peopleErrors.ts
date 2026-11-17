// Messages for the People page. Errors come from the database as `CODE: text` (the reject function),
// as a SQLSTATE (42501 not allowed, 23514 a devops limit), or not at all (a conditional update that
// matched no row because the account changed since the page loaded).

interface ErrorLike {
  message?: string;
  code?: string;
}

export const STALE_MESSAGE = "That account has changed since the page loaded. The lists have been refreshed.";
const FORBIDDEN = "You are not allowed to do that.";
const GENERIC = "Something went wrong. Try again.";

export function peopleActionMessage(error: ErrorLike | null | undefined): string {
  const text = error?.message ?? "";
  if (text.startsWith("PEOPLE_NOT_PENDING")) return "That request has already been handled.";
  if (text.startsWith("PEOPLE_NOT_FOUND")) return "That request no longer exists.";
  if (text.startsWith("PEOPLE_FORBIDDEN") || error?.code === "42501") return FORBIDDEN;
  // The two devops limits: the database's own wording is already clear.
  if (error?.code === "23514" && text) return text;
  return GENERIC;
}
