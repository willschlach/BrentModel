import { describe, expect, it } from "vitest";
import { displayInviteCode, formatInviteCode, isCompleteInviteCode, normalizeInviteCode } from "./inviteCode";

describe("normalizeInviteCode", () => {
  it("ignores case, spaces and hyphens", () => {
    expect(normalizeInviteCode("k7mq-2wxa")).toBe("K7MQ2WXA");
    expect(normalizeInviteCode(" K7MQ 2WXA ")).toBe("K7MQ2WXA");
    expect(normalizeInviteCode("K7MQ2WXA")).toBe("K7MQ2WXA");
  });

  it("drops characters that can never be in a code", () => {
    expect(normalizeInviteCode("O0I1L")).toBe("");
    expect(normalizeInviteCode("K7MQ_2WXA!")).toBe("K7MQ2WXA");
    expect(normalizeInviteCode("")).toBe("");
  });
});

describe("formatInviteCode", () => {
  it("groups in fours", () => {
    expect(formatInviteCode("K7MQ2WXA")).toBe("K7MQ-2WXA");
    expect(formatInviteCode("K7MQ2")).toBe("K7MQ-2");
    expect(formatInviteCode("K7MQ")).toBe("K7MQ");
    expect(formatInviteCode("")).toBe("");
  });
});

describe("isCompleteInviteCode", () => {
  it("needs exactly 8 characters", () => {
    expect(isCompleteInviteCode("K7MQ2WXA")).toBe(true);
    expect(isCompleteInviteCode("K7MQ2WX")).toBe(false);
    expect(isCompleteInviteCode("K7MQ2WXAB")).toBe(false);
  });
});

describe("displayInviteCode", () => {
  it("formats while typing and caps the length", () => {
    expect(displayInviteCode("k7mq")).toBe("K7MQ");
    expect(displayInviteCode("k7mq2")).toBe("K7MQ-2");
    expect(displayInviteCode("k7mq-2wxa-extra")).toBe("K7MQ-2WXA");
  });

  it("round-trips through normalize", () => {
    expect(normalizeInviteCode(displayInviteCode("  k7mq 2wxa "))).toBe("K7MQ2WXA");
  });
});
