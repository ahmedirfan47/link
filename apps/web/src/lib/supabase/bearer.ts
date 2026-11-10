import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import { LimitError } from "@/lib/usage";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Authenticates a request from the desktop app, which sends the user's
 * Supabase access token as "Authorization: Bearer <token>".
 * The returned client acts as that user, so Row Level Security still applies.
 */
export async function requireBearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) throw new HttpError(401, "Missing access token. Sign in again.");

  const supabase = createClient(supabaseUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw new HttpError(401, "Session expired. Sign in again.");
  return { supabase, userId };
}

/** Turns thrown errors into JSON responses. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError || err instanceof LimitError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Server error";
  return Response.json({ error: message }, { status: 500 });
}