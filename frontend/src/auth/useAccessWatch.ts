import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { blockReasonFromMessage } from "../lib/authErrors";
import { useAuth } from "./AuthContext";

const CHECK_EVERY_MS = 60_000;

/**
 * While a user is signed in, notice when their account stops being active and end the session
 * with the right message, without waiting for a reload or for the token to expire.
 *
 * The check reads the user's own profile. Row level security only shows it to an active account,
 * so "no row" (or an expired token that cannot be renewed) means access was withdrawn. The
 * Auth service is then asked to renew the token: the hook refuses with the reason, which is
 * what the login page shows. Network and server errors never sign anyone out.
 */
export function useAccessWatch(): void {
  const { state, endSession } = useAuth();
  const userId = state.status === "signedIn" ? state.session.user.id : null;

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    let stopped = false;
    let running = false;

    const check = async () => {
      if (stopped || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const { data, error, status } = await client.from("profiles").select("status").eq("id", userId).maybeSingle();
        if (stopped) return;

        const tokenRejected = status === 401 || error?.code === "PGRST301" || error?.code === "PGRST303";
        const rowHidden = !error && !data;
        if (!tokenRejected && !rowHidden) return; // visible row, or a transient error: nothing to do

        const { error: refreshError } = await client.auth.refreshSession();
        if (stopped || !refreshError) return;
        const reason = blockReasonFromMessage(refreshError.message);
        if (reason) await endSession(reason);
        // Any other refresh error (network, rate limit) is retried on the next check.
      } finally {
        running = false;
      }
    };

    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, endSession]);
}
