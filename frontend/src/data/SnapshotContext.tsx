import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { RunSnapshot } from "../types";
import { loadSnapshot } from "./api";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; snapshot: RunSnapshot };

const Ctx = createContext<State>({ status: "loading" });

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setState(snapshot ? { status: "ready", snapshot } : { status: "empty" });
      })
      .catch((e: unknown) =>
        !cancelled &&
        setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useSnapshotState(): State {
  return useContext(Ctx);
}
