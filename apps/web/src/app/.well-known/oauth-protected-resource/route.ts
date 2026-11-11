import { OAUTH_SCOPE, oauthJson, preflight, resourceUrl, siteOrigin } from "@/lib/oauth";

/**
 * OAuth protected resource metadata (RFC 9728): tells Claude and ChatGPT that
 * the MCP endpoint is protected and where to sign in. Also served at
 * /.well-known/oauth-protected-resource/api/mcp.
 */
export function GET(request: Request) {
  const origin = siteOrigin(request);
  return oauthJson({
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Link",
    resource_documentation: `${origin}/settings`,
  });
}

export function OPTIONS() {
  return preflight();
}