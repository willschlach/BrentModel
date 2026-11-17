// Feature switches. Password reset needs working email, which the hosted project does not have by
// default (Supabase's built-in mailer only delivers to project team addresses), so it is off in a
// production build until VITE_PASSWORD_RESET_ENABLED=true is set. An explicit value always wins.

export function resolvePasswordResetEnabled(explicit: string | undefined, isDevelopment: boolean): boolean {
  const value = explicit?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return isDevelopment;
}

export const passwordResetEnabled = resolvePasswordResetEnabled(
  import.meta.env.VITE_PASSWORD_RESET_ENABLED,
  import.meta.env.DEV,
);
