import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedRedirectUri, oauthError, oauthJson, preflight, randomToken } from "@/lib/oauth";

/**
 * Dynamic client registration (RFC 7591). Claude and ChatGPT call this once
 * per connection. Clients are public: no secret, PKCE is required instead.
 */

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return oauthError("invalid_client_metadata", "Registration request is too large.");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return oauthError("invalid_client_metadata", "Send the client metadata as JSON.");
  }

  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const redirectUris = [...new Set(uris.filter((u): u is string => typeof u === "string"))];
  if (redirectUris.length === 0 || redirectUris.length > 10) {
    return oauthError("invalid_redirect_uri", "Provide between 1 and 10 redirect_uris.");
  }
  const bad = redirectUris.find((u) => !isAllowedRedirectUri(u));
  if (bad) return oauthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad.slice(0, 200)}`);

  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types : ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return oauthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported.");
  }

  const clientName = (typeof body.client_name === "string" ? body.client_name : "").trim().slice(0, 200);
  const clientId = randomToken("lkc_", 24);
  const { error } = await createAdminClient()
    .from("oauth_clients")
    .insert({ client_id: clientId, client_name: clientName, redirect_uris: redirectUris });
  if (error) return oauthError("server_error", "Could not register the client.", 500);

  return oauthJson(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName || undefined,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "link",
    },
    201,
  );
}

export function OPTIONS() {
  return preflight();
}