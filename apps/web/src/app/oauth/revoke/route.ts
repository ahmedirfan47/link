import { createAdminClient } from "@/lib/supabase/admin";
import { OAUTH_HEADERS, preflight, readParams, sha256Hex } from "@/lib/oauth";

/** Token revocation (RFC 7009). Always answers 200, even for unknown tokens. */
export async function POST(request: Request) {
  const p = await readParams(request);
  const token = p.token ?? "";
  if (token) {
    const hash = sha256Hex(token);
    const column = token.startsWith("lkr_") ? "refresh_hash" : "access_hash";
    await createAdminClient()
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq(column, hash)
      .is("revoked_at", null);
  }
  return new Response(null, { status: 200, headers: OAUTH_HEADERS });
}

export function OPTIONS() {
  return preflight();
}