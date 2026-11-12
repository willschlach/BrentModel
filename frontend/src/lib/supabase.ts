import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-safe settings only. The publishable key is designed to be public;
// access is enforced by row-level security and sign-in, not by hiding this key.
// NEVER put a secret / service-role key in the web app.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, key as string)
  : null;
