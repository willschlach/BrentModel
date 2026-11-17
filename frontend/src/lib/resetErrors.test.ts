import { describe, expect, it } from "vitest";
import {
  classifyRequestError, classifySetPasswordError, classifyVerifyError,
  requestMessage, setPasswordMessage, verifyMessage,
  type RequestFailure, type SetPasswordFailure, type VerifyFailure,
} from "./resetErrors";

describe("classifyRequestError", () => {
  it("recognises the sending limit by code or by status", () => {
    expect(classifyRequestError({ status: 429, code: "over_email_send_rate_limit", message: "..." })).toBe("rate_limited");
    expect(classifyRequestError({ status: 429, message: "slow down" })).toBe("rate_limited");
  });

  it("recognises a refused recipient, by code or by wording", () => {
    expect(classifyRequestError({ status: 400, code: "email_address_not_authorized", message: "x" })).toBe("email_unavailable");
    expect(classifyRequestError({ status: 400, message: "Email address not authorized" })).toBe("email_unavailable");
  });

  it("falls back to unknown", () => {
    expect(classifyRequestError(null)).toBe("unknown");
    expect(classifyRequestError(undefined)).toBe("unknown");
    expect(classifyRequestError({ message: "Failed to fetch" })).toBe("unknown");
  });
});

describe("classifyVerifyError", () => {
  it("treats wrong, expired and reused codes alike", () => {
    expect(classifyVerifyError({ status: 403, code: "otp_expired", message: "Token has expired or is invalid" })).toBe("bad_code");
  });

  it("reads a blocked account from the hook message, not from the code", () => {
    const base = { status: 403, code: "unknown" };
    expect(classifyVerifyError({ ...base, message: "ACCOUNT_DISABLED: This account has been disabled." })).toBe("disabled");
    expect(classifyVerifyError({ ...base, message: "ACCOUNT_PENDING: This account is awaiting approval." })).toBe("pending");
    expect(classifyVerifyError({ ...base, message: "ACCOUNT_NO_ROLE: This account has no access." })).toBe("no_role");
  });

  it("recognises the verification limit", () => {
    expect(classifyVerifyError({ status: 429, code: "over_request_rate_limit", message: "x" })).toBe("rate_limited");
  });

  it("falls back to unknown", () => {
    expect(classifyVerifyError(null)).toBe("unknown");
    expect(classifyVerifyError({ message: "boom" })).toBe("unknown");
  });
});

describe("classifySetPasswordError", () => {
  it("separates weak, same, and a lost session", () => {
    expect(classifySetPasswordError({ status: 422, code: "weak_password", message: "Password should be at least 8 characters." })).toBe("weak");
    expect(classifySetPasswordError({ status: 422, code: "same_password", message: "New password should be different from the old password." })).toBe("same");
    expect(classifySetPasswordError({ status: 400, name: "AuthSessionMissingError", message: "Auth session missing!" })).toBe("session_lost");
    expect(classifySetPasswordError({ message: "Auth session missing!" })).toBe("session_lost");
  });

  it("falls back to unknown", () => {
    expect(classifySetPasswordError(null)).toBe("unknown");
    expect(classifySetPasswordError({ message: "boom" })).toBe("unknown");
  });
});

describe("messages", () => {
  it("every failure has its own words", () => {
    const req: RequestFailure[] = ["rate_limited", "email_unavailable", "unknown"];
    expect(new Set(req.map(requestMessage)).size).toBe(req.length);
    const ver: VerifyFailure[] = ["disabled", "pending", "no_role", "bad_code", "rate_limited", "unknown"];
    expect(new Set(ver.map(verifyMessage)).size).toBe(ver.length);
    const set: SetPasswordFailure[] = ["weak", "same", "session_lost", "unknown"];
    expect(new Set(set.map((f) => setPasswordMessage(f))).size).toBe(set.length);
  });

  it("a blocked account gets the same wording as signing in", () => {
    expect(verifyMessage("disabled")).toMatch(/disabled/i);
    expect(verifyMessage("pending")).toMatch(/awaiting approval/i);
  });

  it("does not repeat the server's wait time", () => {
    expect(requestMessage("rate_limited")).not.toMatch(/\d+ seconds/);
  });

  it("prefers the server's wording for a weak password", () => {
    expect(setPasswordMessage("weak", "Password should be at least 8 characters.")).toBe("Password should be at least 8 characters.");
    expect(setPasswordMessage("weak")).toMatch(/not strong enough/);
    expect(setPasswordMessage("same", "ignored")).toMatch(/different/);
  });
});
