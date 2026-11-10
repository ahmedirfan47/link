"use server";

import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { DESKTOP_SCHEME } from "@/lib/releases";

/**
 * Creates a one-time code the desktop app trades for a session. The code is
 * bound to a challenge only that desktop app can answer (PKCE), expires in
 * five minutes and works once.
 */
export async function createHandoff(challenge: string): Promise<{ url?: string; error?: string }> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return { error: "This sign-in link is not valid. Start again from the app." };
  const { supabase, userId } = await requireUser();
  const code = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("desktop_handoffs").insert({ code, user_id: userId, challenge });
  if (error) return { error: error.message };
  return { url: `${DESKTOP_SCHEME}://auth?code=${code}` };
}