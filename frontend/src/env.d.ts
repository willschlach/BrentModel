interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** "true" or "false". Unset means on in development and off in a production build. */
  readonly VITE_PASSWORD_RESET_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
