import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/env";

/**
 * Supabase client with the secret key. It bypasses Row Level Security, so every
 * query made with it must filter by the user it acts for. Use it only where a
 * user-scoped client cannot do the job.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}