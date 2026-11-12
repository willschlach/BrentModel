// The login page sends people back to the page they asked for. That value arrives from the URL,
// so it is untrusted: only plain in-app paths are accepted. Anything else goes to the home page.

const HOME = "/";

export function safeRedirectPath(from: string | null | undefined): string {
  if (!from) return HOME;
  // Must be an absolute in-app path. "//host" and "/\host" are treated as external by browsers.
  if (!from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return HOME;
  if (from.includes("\\")) return HOME;
  // Control characters (tab, newline, ...) can be stripped by browsers and change meaning.
  if (/[\u0000-\u001f\u007f]/.test(from)) return HOME;
  // Never bounce back to the login page itself.
  if (from === "/login" || from.startsWith("/login?") || from.startsWith("/login/")) return HOME;
  return from;
}
