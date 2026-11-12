export function ConfigError() {
  return (
    <p className="status-msg" role="alert">
      Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild.
    </p>
  );
}
