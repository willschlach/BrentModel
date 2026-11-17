// What the People page offers a viewer on each row. This is the screen's reading of the database
// rules (supabase/migrations/..._profiles_rules.sql); the database is the authority and refuses
// anything this gets wrong. Keep it in step with the table in the archived add-account-management design (D3), openspec/changes/archive.
//
// Devops accounts are only ever created with the command-line script, so the screen never offers
// the devops role and never changes the role of a devops row.

import type { AppRole } from "./claims";

export type AccountStatus = "pending" | "active" | "disabled";

export interface PersonRow {
  id: string;
  email: string;
  role: AppRole;
  status: AccountStatus;
  created_at: string;
}

export interface RowActions {
  approve: boolean;
  reject: boolean;
  disable: boolean;
  restore: boolean;
  /** Roles the row can be switched to. Empty means no role control. */
  roleOptions: ReadonlyArray<"member" | "admin">;
}

const NONE: RowActions = { approve: false, reject: false, disable: false, restore: false, roleOptions: [] };

export function allowedActions(viewer: AppRole, row: PersonRow, isSelf: boolean): RowActions {
  if (isSelf || viewer === "member") return NONE;

  if (row.status === "pending") {
    // Pending accounts are members; an admin acts on members only.
    if (viewer === "admin" && row.role !== "member") return NONE;
    return { ...NONE, approve: true, reject: true };
  }

  const toggles = { disable: row.status === "active", restore: row.status === "disabled" };

  if (viewer === "devops") {
    if (row.role === "devops") return { ...NONE, ...toggles };
    return { ...NONE, ...toggles, roleOptions: ["member", "admin"] };
  }

  // viewer is an admin: members only, and the only role change is promotion.
  if (row.role !== "member") return NONE;
  return { ...NONE, ...toggles, roleOptions: ["member", "admin"] };
}

const ROLE_ORDER: Record<AppRole, number> = { devops: 0, admin: 1, member: 2 };

/** Table order: role (devops, admin, member), then email. */
export function comparePeople(a: PersonRow, b: PersonRow): number {
  return ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.email.localeCompare(b.email);
}

/** Pending requests, oldest first. */
export function comparePending(a: PersonRow, b: PersonRow): number {
  return a.created_at.localeCompare(b.created_at) || a.email.localeCompare(b.email);
}
