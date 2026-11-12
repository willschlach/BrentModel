import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("keeps plain in-app paths, with query strings", () => {
    expect(safeRedirectPath("/decision")).toBe("/decision");
    expect(safeRedirectPath("/data?tab=audit")).toBe("/data?tab=audit");
  });

  it("falls back to home when missing", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("//evil.example/path")).toBe("/");
    expect(safeRedirectPath("https://evil.example")).toBe("/");
    expect(safeRedirectPath("http://evil.example/x")).toBe("/");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
    expect(safeRedirectPath("evil.example")).toBe("/");
  });

  it("rejects backslash tricks and control characters", () => {
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath("/ok\\..\\evil")).toBe("/");
    expect(safeRedirectPath("/\t/evil.example")).toBe("/");
    expect(safeRedirectPath("/ok\nnext")).toBe("/");
  });

  it("never returns to the login page", () => {
    expect(safeRedirectPath("/login")).toBe("/");
    expect(safeRedirectPath("/login?from=/why")).toBe("/");
    expect(safeRedirectPath("/loginx")).toBe("/loginx");
  });
});
