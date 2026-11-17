import { describe, expect, it } from "vitest";
import { classifySignUpError, inviteActionMessage, signUpMessage, type SignUpFailure } from "./inviteErrors";

const hook = (message: string) => ({ status: 400, code: "unknown", message });

describe("classifySignUpError", () => {
  it("reads each rejection code from the message prefix", () => {
    expect(classifySignUpError(hook("INVITE_NO_INVITE: There is no invite for this email address."))).toBe("no_invite");
    expect(classifySignUpError(hook("INVITE_WRONG_CODE: That invite code is incorrect."))).toBe("wrong_code");
    expect(classifySignUpError(hook("INVITE_EXPIRED: This invite has expired."))).toBe("expired");
    expect(classifySignUpError(hook("INVITE_USED: This invite has already been used."))).toBe("used");
    expect(classifySignUpError(hook("INVITE_REVOKED: This invite was revoked."))).toBe("revoked");
    expect(classifySignUpError(hook("INVITE_LOCKED: This invite is locked."))).toBe("locked");
    expect(classifySignUpError(hook("INVITE_INVALID: nope"))).toBe("invalid");
  });

  it("treats the pending refusal as a submitted request, not a failure", () => {
    expect(classifySignUpError({ status: 403, code: "unknown", message: "ACCOUNT_PENDING: This account is awaiting approval." })).toBe("pending");
  });

  it("recognises errors raised by Auth itself", () => {
    expect(classifySignUpError({ status: 422, code: "user_already_exists", message: "User already registered" })).toBe("already_registered");
    expect(classifySignUpError({ status: 422, code: "weak_password", message: "Password should be at least 8 characters." })).toBe("weak_password");
    expect(classifySignUpError({ status: 422, code: "signup_disabled", message: "Signups not allowed for this instance" })).toBe("signups_closed");
  });

  it("falls back to unknown", () => {
    expect(classifySignUpError(null)).toBe("unknown");
    expect(classifySignUpError(undefined)).toBe("unknown");
    expect(classifySignUpError({ message: "Failed to fetch" })).toBe("unknown");
    expect(classifySignUpError({ message: "see INVITE_USED later" })).toBe("unknown");
  });
});

describe("signUpMessage", () => {
  it("has a distinct message for every failure", () => {
    const all: SignUpFailure[] = ["no_invite", "wrong_code", "expired", "used", "revoked", "locked", "invalid", "already_registered", "weak_password", "signups_closed", "unknown"];
    expect(new Set(all.map(signUpMessage)).size).toBe(all.length);
  });
});

describe("inviteActionMessage", () => {
  it("maps every invite-function error", () => {
    for (const code of ["INVITE_FORBIDDEN", "INVITE_BAD_ROLE", "INVITE_BAD_EMAIL", "INVITE_ACCOUNT_EXISTS", "INVITE_ACCOUNT_DISABLED", "INVITE_NOT_FOUND", "INVITE_ALREADY_USED", "INVITE_ALREADY_REVOKED", "INVITE_NOT_EDITABLE"]) {
      const msg = inviteActionMessage({ message: `${code}: server text`, code: "P0001" });
      expect(msg).not.toMatch(/went wrong/);
      expect(msg).not.toContain("server text");
    }
  });

  it("tells a disabled-account conflict apart from an existing one", () => {
    expect(inviteActionMessage({ message: "INVITE_ACCOUNT_DISABLED: x" })).toMatch(/restore/i);
    expect(inviteActionMessage({ message: "INVITE_ACCOUNT_EXISTS: x" })).toMatch(/already exists/i);
  });

  it("treats a bare database permission error as forbidden", () => {
    expect(inviteActionMessage({ message: "permission denied for function create_invite", code: "42501" })).toBe("You are not allowed to do that.");
  });

  it("is safe with anything else", () => {
    expect(inviteActionMessage(null)).toMatch(/went wrong/);
    expect(inviteActionMessage({ message: "boom" })).toMatch(/went wrong/);
  });
});
