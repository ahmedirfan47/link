import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The email confirmation link lands here with a one-time ?code=.
 * It is exchanged for a session cookie, then the user goes to their packs.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/packs`);
  }

  const message = encodeURIComponent(
    "That sign-in link is invalid or expired. Open it in the same browser you signed up in, or sign in again.",
  );
  return NextResponse.redirect(`${origin}/login?error=${message}`);
}