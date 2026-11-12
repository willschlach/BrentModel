import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ConfigError } from "./ConfigError";
import { useAuth } from "./AuthContext";
import { useAccessWatch } from "./useAccessWatch";

function Watcher() {
  useAccessWatch();
  return null;
}

/** Shows its children only to a signed-in user. Everyone else is sent to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return <p className="status-msg" role="status">Checking your session…</p>;
  }
  if (state.status === "misconfigured") return <ConfigError />;
  if (state.status === "signedOut") {
    const from = location.pathname + location.search;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }
  return (
    <>
      <Watcher />
      {children}
    </>
  );
}
