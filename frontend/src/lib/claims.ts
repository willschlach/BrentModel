// Reads the role and status that the access token hook puts into the session token.
//
// This is for the UI only (what to show, whether to let someone in). The signature is NOT checked
// here and cannot be: the real decisions are made by the database (row level security), which
// reads the live profile on every request.

export type AppRole = "devops" | "admin" | "member";

export interface AccessClaims {
  role: AppRole;
  status: "active";
}

const ROLES: readonly AppRole[] = ["devops", "admin", "member"];

function decodePayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Returns the claims of an active, roled account, or null when the token does not carry them. */
export function readAccessClaims(token: string): AccessClaims | null {
  const payload = decodePayload(token);
  if (!payload) return null;
  const role = payload.user_role;
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) return null;
  if (payload.user_status !== "active") return null;
  return { role: role as AppRole, status: "active" };
}
