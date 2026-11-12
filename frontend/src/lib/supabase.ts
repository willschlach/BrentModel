import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-safe settings only. The publishable key is designed to be public;
// access is enforced by row-level security and sign-in, not by hiding this key.
// NEVER put a secret / service-role key in the web app.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, key as string, {
      auth: {
        // Keep users signed in across reloads, tabs and browser restarts, and renew the
        // short-lived access token in the background.
        persistSession: true,
        autoRefreshToken: true,
        // PKCE sends a ?code= in the query string. The default implicit flow would put tokens
        // in the URL fragment, which the hash router would swallow. There are no email links
        // in phase 1; detection stays off until a redirect route exists to handle them.
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    })
  : null;
