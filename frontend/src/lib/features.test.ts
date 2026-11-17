import { describe, expect, it } from "vitest";
import { resolvePasswordResetEnabled } from "./features";

describe("resolvePasswordResetEnabled", () => {
  it("an explicit true wins, in production or development", () => {
    expect(resolvePasswordResetEnabled("true", false)).toBe(true);
    expect(resolvePasswordResetEnabled("true", true)).toBe(true);
  });

  it("an explicit false wins, in production or development", () => {
    expect(resolvePasswordResetEnabled("false", true)).toBe(false);
    expect(resolvePasswordResetEnabled("false", false)).toBe(false);
  });

  it("unset means on in development and off in production", () => {
    expect(resolvePasswordResetEnabled(undefined, true)).toBe(true);
    expect(resolvePasswordResetEnabled(undefined, false)).toBe(false);
  });

  it("ignores case and spaces, and treats anything unrecognised as unset", () => {
    expect(resolvePasswordResetEnabled(" TRUE ", false)).toBe(true);
    expect(resolvePasswordResetEnabled("False", true)).toBe(false);
    expect(resolvePasswordResetEnabled("", false)).toBe(false);
    expect(resolvePasswordResetEnabled("yes", false)).toBe(false);
    expect(resolvePasswordResetEnabled("1", true)).toBe(true);
  });
});
