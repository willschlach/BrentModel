import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { AppRole } from "../lib/claims";
import { useAuth } from "./AuthContext";

/**
 * Shows its children only to a signed-in user with one of these roles; anyone else goes to the home page.
 * Use inside RequireAuth. This only keeps people away from a screen they have no use for: the
 * database refuses their requests whatever the browser does.
 */
export function RequireRole({ roles, children }: { roles: readonly AppRole[]; children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  if (!roles.includes(state.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
