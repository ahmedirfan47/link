import "server-only";
import { currentOrigin } from "@/lib/origin";
import { OAUTH_SCOPE, getClient, redirectMatches, resourceUrl, type OAuthClient } from "@/lib/oauth";

/** The fields of an authorization request, as received in the URL or the consent form. */
export interface AuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  scope: string;
  resource: string;
}

export const AUTHORIZE_FIELDS: (keyof AuthorizeParams)[] = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
];

export function readAuthorizeParams(get: (key: string) => unknown): AuthorizeParams {
  const out = {} as AuthorizeParams;
  for (const key of AUTHORIZE_FIELDS) {
    const value = get(key);
    out[key] = typeof value === "string" ? value.slice(0, 2000) : "";
  }
  return out;
}

export type Checked =
  /** Cannot tell the client safely: show the error on our page, do not redirect. */
  | { kind: "fatal"; message: string }
  /** The client is known: send the error back to it. */
  | { kind: "redirect-error"; url: string }
  | { kind: "ok"; client: OAuthClient; params: AuthorizeParams; issuer: string };

export function redirectWith(redirectUri: string, values: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(values)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

/** Validates an authorization request (OAuth 2.1 with PKCE S256). */
export async function checkAuthorizeRequest(params: AuthorizeParams): Promise<Checked> {
  const client = await getClient(params.client_id);
  if (!client) return { kind: "fatal", message: "This app is not registered with Link. Try connecting again from the app." };
  if (!params.redirect_uri || !redirectMatches(client.redirect_uris, params.redirect_uri)) {
    return { kind: "fatal", message: "The return address of this app does not match its registration." };
  }

  const issuer = await currentOrigin();
  const fail = (error: string, description: string): Checked => ({
    kind: "redirect-error",
    url: redirectWith(params.redirect_uri, { error, error_description: description, state: params.state, iss: issuer }),
  });

  if (params.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  if (params.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  const scopes = params.scope.split(/\s+/).filter(Boolean);
  if (scopes.some((s) => s !== OAUTH_SCOPE)) return fail("invalid_scope", `Only the "${OAUTH_SCOPE}" scope exists.`);
  if (params.resource) {
    const resource = params.resource.replace(/\/+$/, "");
    if (resource !== resourceUrl(issuer) && resource !== issuer) {
      return fail("invalid_target", "This server only issues tokens for its MCP endpoint.");
    }
  }
  return { kind: "ok", client, params, issuer };
}