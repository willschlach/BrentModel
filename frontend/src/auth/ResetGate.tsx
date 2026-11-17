import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { passwordResetEnabled } from "../lib/features";

/** The password reset pages exist only while the feature is switched on (see lib/features.ts). */
export function ResetGate({ children }: { children: ReactNode }) {
  if (!passwordResetEnabled) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
