import { OAUTH_SCOPE, oauthJson, preflight, siteOrigin } from "@/lib/oauth";

/** OAuth authorization server metadata (RFC 8414). */
export function GET(request: Request) {
  const origin = siteOrigin(request);
  return oauthJson({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/settings`,
  });
}

export function OPTIONS() {
  return preflight();
}