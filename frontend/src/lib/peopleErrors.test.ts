import { describe, expect, it } from "vitest";
import { peopleActionMessage, STALE_MESSAGE } from "./peopleErrors";

describe("peopleActionMessage", () => {
  it("explains a request that was already handled or is gone", () => {
    expect(peopleActionMessage({ message: "PEOPLE_NOT_PENDING: That request has already been handled.", code: "P0001" })).toBe("That request has already been handled.");
    expect(peopleActionMessage({ message: "PEOPLE_NOT_FOUND: x", code: "P0001" })).toBe("That request no longer exists.");
  });

  it("treats every permission failure the same way", () => {
    expect(peopleActionMessage({ message: "PEOPLE_FORBIDDEN: x", code: "42501" })).toBe("You are not allowed to do that.");
    expect(peopleActionMessage({ message: "Admins can only act on members.", code: "42501" })).toBe("You are not allowed to do that.");
    expect(peopleActionMessage({ message: "permission denied for function reject_pending_request", code: "42501" })).toBe("You are not allowed to do that.");
  });

  it("passes the devops limits through in the database's words", () => {
    expect(peopleActionMessage({ message: "There must always be at least 1 active devops account.", code: "23514" })).toBe("There must always be at least 1 active devops account.");
    expect(peopleActionMessage({ message: "There can be at most 2 active devops accounts.", code: "23514" })).toBe("There can be at most 2 active devops accounts.");
  });

  it("falls back safely", () => {
    expect(peopleActionMessage(null)).toMatch(/went wrong/);
    expect(peopleActionMessage({ message: "boom" })).toMatch(/went wrong/);
    expect(peopleActionMessage({ code: "23514" })).toMatch(/went wrong/);
  });

  it("has a stale-row message that says what happened", () => {
    expect(STALE_MESSAGE).toMatch(/changed/);
  });
});
