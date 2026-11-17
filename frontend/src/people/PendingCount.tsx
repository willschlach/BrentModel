import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";

const REFRESH_EVERY_MS = 60_000;

interface PendingCountApi {
  /** Pending requests the signed-in devops user or admin can see. Always 0 for anyone else. */
  count: number;
  /** Re-read the count now. The People page calls this after every action. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<PendingCountApi>({ count: 0, refresh: async () => {} });

/**
 * Keeps the number of pending sign-up requests for the header badge. Only devops and admin get a
 * count. Row level security decides what each of them can count, so no filter on role is needed
 * in the query. Refreshes on start, when the window regains focus, about once a minute while the
 * tab is visible, and whenever the People page asks.
 */
export function PendingCountProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const userId = state.status === "signedIn" ? state.session.user.id : null;
  const eligible = state.status === "signedIn" && (state.role === "devops" || state.role === "admin");
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabase || !eligible) return;
    const { count: total, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    // A failed read keeps the last number rather than flashing zero.
    if (!error && total !== null) setCount(total);
  }, [eligible]);

  useEffect(() => {
    if (!eligible || !userId) {
      setCount(0);
      return;
    }
    void refresh();
    const visibleRefresh = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(visibleRefresh, REFRESH_EVERY_MS);
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [eligible, userId, refresh]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePendingCount(): PendingCountApi {
  return useContext(Ctx);
}
