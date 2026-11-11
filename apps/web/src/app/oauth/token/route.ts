import { createAdminClient } from "@/lib/supabase/admin";
import {
  getClient,
  issueTokens,
  oauthError,
  oauthJson,
  pkceMatches,
  preflight,
  readParams,
  redirectMatches,
  sha256Hex,
} from "@/lib/oauth";

/**
 * Token endpoint: exchanges an authorization code (with its PKCE verifier) for
 * tokens, and rotates refresh tokens. A used refresh token stops working.
 */

export async function POST(request: Request) {
  const p = await readParams(request);
  const client = await getClient(p.client_id ?? "");
  if (!client) return oauthError("invalid_client", "Unknown client_id.", 401);

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.code_verifier || !p.redirect_uri) {
      return oauthError("invalid_request", "code, code_verifier and redirect_uri are required.");
    }
    // Mark the code used in the same statement that reads it, so it works once only.
    const { data: code } = await admin
      .from("oauth_codes")
      .update({ used_at: now })
      .eq("code_hash", sha256Hex(p.code))
      .eq("client_id", client.client_id)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("user_id, redirect_uri, code_challenge, scope")
      .maybeSingle();
    if (!code) return oauthError("invalid_grant", "The authorization code is invalid, expired or already used.");
    if (code.redirect_uri !== p.redirect_uri || !redirectMatches(client.redirect_uris, p.redirect_uri)) {
      return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
    }
    if (!pkceMatches(p.code_verifier, code.code_challenge as string)) {
      return oauthError("invalid_grant", "PKCE verification failed.");
    }

    await admin.from("oauth_clients").update({ last_used_at: now }).eq("client_id", client.client_id);
    return oauthJson(await issueTokens(client.client_id, code.user_id as string, code.scope as string));
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthError("invalid_request", "refresh_token is required.");
    const { data: old } = await admin
      .from("oauth_tokens")
      .update({ revoked_at: now })
      .eq("refresh_hash", sha256Hex(p.refresh_token))
      .eq("client_id", client.client_id)
      .is("revoked_at", null)
      .gt("refresh_expires_at", now)
      .select("user_id, scope")
      .maybeSingle();
    if (!old) return oauthError("invalid_grant", "The refresh token is invalid, expired or was revoked.");
    return oauthJson(await issueTokens(client.client_id, old.user_id as string, old.scope as string));
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export function OPTIONS() {
  return preflight();
}