import type { RunSnapshot } from "../types";

export type SnapshotResult = { kind: "ready"; snapshot: RunSnapshot } | { kind: "none" };

/**
 * Decide what a response for the run snapshot means.
 *
 *   404, or a successful response that is not JSON  -> "none"  (no run has been published; the
 *       non-JSON case covers a dev server answering a missing file with the app's index.html)
 *   any other failed response                       -> throws  (a real error)
 *   JSON whose schemaVersion is not 1               -> throws  (an unsupported version)
 *   JSON with schemaVersion 1                       -> "ready"
 */
export function classifySnapshotResponse(status: number, bodyText: string): SnapshotResult {
  if (status === 404) return { kind: "none" };
  if (status < 200 || status >= 300) {
    throw new Error(`Could not load the run data (HTTP ${status}).`);
  }
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return { kind: "none" };
  }
  const version = data !== null && typeof data === "object" ? (data as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version !== 1) {
    throw new Error(`Unsupported snapshot schemaVersion ${String(version)}.`);
  }
  return { kind: "ready", snapshot: data as RunSnapshot };
}
