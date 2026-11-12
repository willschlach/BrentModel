import { describe, expect, it } from "vitest";
import { classifySnapshotResponse } from "./classifySnapshot";

const v1 = JSON.stringify({ schemaVersion: 1, meta: { runDate: "2026-01-01" } });

describe("classifySnapshotResponse", () => {
  it("treats 404 as no run data", () => {
    expect(classifySnapshotResponse(404, "Not found")).toEqual({ kind: "none" });
  });

  it("treats a successful non-JSON response as no run data (dev server HTML fallback)", () => {
    expect(classifySnapshotResponse(200, "<!doctype html><html></html>")).toEqual({ kind: "none" });
    expect(classifySnapshotResponse(200, "")).toEqual({ kind: "none" });
  });

  it("treats other failures as errors, not as an empty state", () => {
    expect(() => classifySnapshotResponse(500, "")).toThrow(/HTTP 500/);
    expect(() => classifySnapshotResponse(403, "")).toThrow(/HTTP 403/);
    expect(() => classifySnapshotResponse(301, "")).toThrow(/HTTP 301/);
  });

  it("returns schemaVersion 1 data", () => {
    const result = classifySnapshotResponse(200, v1);
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.snapshot.meta.runDate).toBe("2026-01-01");
  });

  it("names an unsupported version instead of showing the empty state", () => {
    expect(() => classifySnapshotResponse(200, JSON.stringify({ schemaVersion: 2 }))).toThrow(/schemaVersion 2/);
    expect(() => classifySnapshotResponse(200, JSON.stringify({}))).toThrow(/schemaVersion undefined/);
    expect(() => classifySnapshotResponse(200, "null")).toThrow(/Unsupported/);
    expect(() => classifySnapshotResponse(200, "[1]")).toThrow(/Unsupported/);
  });
});
