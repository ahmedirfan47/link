import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Email links (sign-up confirmation, password reset) land here with a one-time
 * ?code=. It is exchanged for a session cookie, then the user goes to ?next=.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  const message = encodeURIComponent(
    "That link is invalid or expired. Open it in the same browser you requested it from, or try again.",
  );
  return NextResponse.redirect(`${origin}/login?error=${message}`);
}