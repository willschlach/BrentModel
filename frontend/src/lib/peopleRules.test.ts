import { describe, expect, it } from "vitest";
import { allowedActions, comparePending, comparePeople, type AccountStatus, type PersonRow } from "./peopleRules";
import type { AppRole } from "./claims";

const row = (role: AppRole, status: AccountStatus, email = "x@example.com", created = "2026-01-01T00:00:00Z"): PersonRow =>
  ({ id: email, email, role, status, created_at: created });

describe("allowedActions", () => {
  it("gives nothing on your own row", () => {
    for (const viewer of ["devops", "admin"] as const) {
      expect(allowedActions(viewer, row("member", "active"), true)).toEqual({
        approve: false, reject: false, disable: false, restore: false, roleOptions: [],
      });
    }
  });

  it("gives a member nothing at all", () => {
    expect(allowedActions("member", row("member", "pending"), false).approve).toBe(false);
    expect(allowedActions("member", row("member", "active"), false).disable).toBe(false);
  });

  it("lets devops and admin approve or reject a pending member, and nothing else on it", () => {
    for (const viewer of ["devops", "admin"] as const) {
      const a = allowedActions(viewer, row("member", "pending"), false);
      expect(a).toMatchObject({ approve: true, reject: true, disable: false, restore: false, roleOptions: [] });
    }
  });

  it("keeps an admin to members, even for a pending non-member", () => {
    expect(allowedActions("admin", row("admin", "pending"), false).approve).toBe(false);
    expect(allowedActions("devops", row("admin", "pending"), false).approve).toBe(true);
  });

  it("lets devops disable, restore, and switch member/admin rows between member and admin", () => {
    for (const role of ["member", "admin"] as const) {
      expect(allowedActions("devops", row(role, "active"), false)).toMatchObject({ disable: true, restore: false, roleOptions: ["member", "admin"] });
      expect(allowedActions("devops", row(role, "disabled"), false)).toMatchObject({ disable: false, restore: true, roleOptions: ["member", "admin"] });
    }
  });

  it("lets devops disable and restore a devops row but never changes its role", () => {
    expect(allowedActions("devops", row("devops", "active"), false)).toMatchObject({ disable: true, roleOptions: [] });
    expect(allowedActions("devops", row("devops", "disabled"), false)).toMatchObject({ restore: true, roleOptions: [] });
  });

  it("never offers the devops role", () => {
    for (const viewer of ["devops", "admin"] as const) {
      for (const role of ["member", "admin", "devops"] as const) {
        for (const status of ["pending", "active", "disabled"] as const) {
          expect(allowedActions(viewer, row(role, status), false).roleOptions).not.toContain("devops");
        }
      }
    }
  });

  it("lets an admin act on members only", () => {
    expect(allowedActions("admin", row("member", "active"), false)).toMatchObject({ disable: true, roleOptions: ["member", "admin"] });
    expect(allowedActions("admin", row("member", "disabled"), false)).toMatchObject({ restore: true, roleOptions: ["member", "admin"] });
    for (const role of ["admin", "devops"] as const) {
      expect(allowedActions("admin", row(role, "active"), false)).toEqual({
        approve: false, reject: false, disable: false, restore: false, roleOptions: [],
      });
      expect(allowedActions("admin", row(role, "disabled"), false).restore).toBe(false);
    }
  });
});

describe("ordering", () => {
  it("sorts people by role then email", () => {
    const list = [row("member", "active", "b@x"), row("admin", "active", "z@x"), row("devops", "active", "m@x"), row("member", "active", "a@x"), row("admin", "active", "a@x")];
    expect(list.sort(comparePeople).map((r) => `${r.role}:${r.email}`)).toEqual(["devops:m@x", "admin:a@x", "admin:z@x", "member:a@x", "member:b@x"]);
  });

  it("sorts pending oldest first", () => {
    const list = [row("member", "pending", "new@x", "2026-03-01T00:00:00Z"), row("member", "pending", "old@x", "2026-01-01T00:00:00Z")];
    expect(list.sort(comparePending).map((r) => r.email)).toEqual(["old@x", "new@x"]);
  });
});
