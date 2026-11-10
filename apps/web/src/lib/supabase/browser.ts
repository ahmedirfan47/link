import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser, signed in through the same cookies as the
 * server. Used only to upload source files straight to Storage, so large files
 * never pass through a serverless function (Vercel caps request bodies at 4.5 MB).
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}