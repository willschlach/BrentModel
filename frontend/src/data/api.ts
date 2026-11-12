import type { RunSnapshot } from "../types";
import { classifySnapshotResponse } from "./classifySnapshot";

// Single data-access point. v1 reads a static JSON written by
// `python -m brent_hedge.export` (run from backend/). A live API would replace only this function.
// Returns null when no run has been published. Throws for real failures.
export async function loadSnapshot(): Promise<RunSnapshot | null> {
  const url = `${import.meta.env.BASE_URL}data/latest.json`;
  const res = await fetch(url, { cache: "no-store" });
  const result = classifySnapshotResponse(res.status, await res.text());
  return result.kind === "ready" ? result.snapshot : null;
}
