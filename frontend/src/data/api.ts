import type { RunSnapshot } from "../types";

// Single data-access point. v1 reads a static JSON written by
// `python -m brent_hedge.export` (run from backend/). A live API would replace only this function.
export async function loadSnapshot(): Promise<RunSnapshot> {
  const url = `${import.meta.env.BASE_URL}data/latest.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not load ${url} (HTTP ${res.status}). Run the Python export first.`);
  }
  const data = (await res.json()) as RunSnapshot;
  if (data.schemaVersion !== 1) {
    throw new Error(`Unsupported snapshot schemaVersion ${String(data.schemaVersion)}.`);
  }
  return data;
}
