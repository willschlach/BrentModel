import { describe, expect, it } from "vitest";
import { readAccessClaims } from "./claims";

function tokenWith(payload: unknown): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "none" })}.${enc(payload)}.sig`;
}

describe("readAccessClaims", () => {
  it("reads the role of an active account", () => {
    expect(readAccessClaims(tokenWith({ user_role: "devops", user_status: "active" }))).toEqual({ role: "devops", status: "active" });
    expect(readAccessClaims(tokenWith({ user_role: "member", user_status: "active" }))?.role).toBe("member");
  });

  it("ignores the built-in role claim", () => {
    expect(readAccessClaims(tokenWith({ role: "authenticated" }))).toBeNull();
  });

  it("rejects missing, unknown, or non-active values", () => {
    expect(readAccessClaims(tokenWith({}))).toBeNull();
    expect(readAccessClaims(tokenWith({ user_role: "owner", user_status: "active" }))).toBeNull();
    expect(readAccessClaims(tokenWith({ user_role: "admin", user_status: "disabled" }))).toBeNull();
    expect(readAccessClaims(tokenWith({ user_role: "admin" }))).toBeNull();
    expect(readAccessClaims(tokenWith({ user_role: 1, user_status: "active" }))).toBeNull();
  });

  it("returns null for malformed tokens instead of throwing", () => {
    expect(readAccessClaims("")).toBeNull();
    expect(readAccessClaims("abc")).toBeNull();
    expect(readAccessClaims("a.%%%.c")).toBeNull();
    expect(readAccessClaims(tokenWith("a string"))).toBeNull();
    expect(readAccessClaims(tokenWith([1, 2]))).toBeNull();
  });
});
