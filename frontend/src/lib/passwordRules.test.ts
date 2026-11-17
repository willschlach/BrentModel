import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, passwordChecks, passwordIsValid } from "./passwordRules";

const met = (p: string, r: string) => Object.fromEntries(passwordChecks(p, r).map((c) => [c.id, c.met]));

describe("passwordChecks", () => {
  it("starts with nothing met", () => {
    expect(met("", "")).toEqual({ length: false, match: false });
  });

  it("checks the length on the first password", () => {
    expect(met("a".repeat(MIN_PASSWORD_LENGTH - 1), "").length).toBe(false);
    expect(met("a".repeat(MIN_PASSWORD_LENGTH), "").length).toBe(true);
  });

  it("needs a non-empty password and an identical repeat to match", () => {
    expect(met("longenough1", "longenough1").match).toBe(true);
    expect(met("longenough1", "longenough2").match).toBe(false);
    expect(met("longenough1", "").match).toBe(false);
    expect(met("", "").match).toBe(false);
  });

  it("is valid only when everything is met", () => {
    expect(passwordIsValid("longenough1", "longenough1")).toBe(true);
    expect(passwordIsValid("short", "short")).toBe(false);
    expect(passwordIsValid("longenough1", "other")).toBe(false);
  });

  it("labels the rules in words", () => {
    expect(passwordChecks("", "").map((c) => c.label)).toEqual([`At least ${MIN_PASSWORD_LENGTH} characters`, "Both passwords match"]);
  });
});
