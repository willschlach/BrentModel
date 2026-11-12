import { describe, expect, it } from "vitest";
import { blockReasonFromMessage, classifySignInError, messageFor } from "./authErrors";

describe("classifySignInError", () => {
  it("reads the hook code from the message prefix, not from error.code", () => {
    const base = { status: 403, code: "unknown" };
    expect(classifySignInError({ ...base, message: "ACCOUNT_DISABLED: This account has been disabled." })).toBe("disabled");
    expect(classifySignInError({ ...base, message: "ACCOUNT_PENDING: This account is awaiting approval." })).toBe("pending");
    expect(classifySignInError({ ...base, message: "ACCOUNT_NO_ROLE: This account has no access." })).toBe("no_role");
  });

  it("recognises wrong credentials", () => {
    expect(classifySignInError({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" })).toBe("invalid_credentials");
  });

  it("falls back to unknown for anything else", () => {
    expect(classifySignInError({ status: 500, message: "boom" })).toBe("unknown");
    expect(classifySignInError({ message: "Failed to fetch" })).toBe("unknown");
    expect(classifySignInError({})).toBe("unknown");
    expect(classifySignInError(null)).toBe("unknown");
    expect(classifySignInError(undefined)).toBe("unknown");
  });

  it("does not match a code in the middle of a message", () => {
    expect(classifySignInError({ message: "see ACCOUNT_DISABLED later", code: "unknown" })).toBe("unknown");
  });
});

describe("blockReasonFromMessage", () => {
  it("returns null for undefined and unrelated text", () => {
    expect(blockReasonFromMessage(undefined)).toBeNull();
    expect(blockReasonFromMessage("Invalid login credentials")).toBeNull();
  });
});

describe("messageFor", () => {
  it("gives every state its own text", () => {
    const reasons = ["invalid_credentials", "disabled", "pending", "no_role", "unknown"] as const;
    const texts = reasons.map(messageFor);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(messageFor("disabled")).toMatch(/disabled/i);
    expect(messageFor("pending")).toMatch(/awaiting approval/i);
    expect(messageFor("no_role")).toMatch(/no access/i);
  });

  it("does not reveal whether an email has an account", () => {
    expect(messageFor("invalid_credentials")).toBe("Incorrect email or password.");
  });
});
