import { describe, expect, it } from "vitest";
import { displayResetCode, isCompleteResetCode, normalizeEmail, normalizeResetCode } from "./resetCode";

describe("reset code", () => {
  it("keeps digits only", () => {
    expect(normalizeResetCode("123456")).toBe("123456");
    expect(normalizeResetCode(" 123 456 ")).toBe("123456");
    expect(normalizeResetCode("123-456")).toBe("123456");
    expect(normalizeResetCode("abc")).toBe("");
    expect(normalizeResetCode("")).toBe("");
  });

  it("needs exactly 6 digits", () => {
    expect(isCompleteResetCode("123456")).toBe(true);
    expect(isCompleteResetCode("12345")).toBe(false);
    expect(isCompleteResetCode("1234567")).toBe(false);
  });

  it("caps the field at 6 digits while typing or pasting", () => {
    expect(displayResetCode("12")).toBe("12");
    expect(displayResetCode("123 456 789")).toBe("123456");
    expect(displayResetCode("a1b2")).toBe("12");
  });
});

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });
});
