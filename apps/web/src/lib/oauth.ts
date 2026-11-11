import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * OAuth 2.1 for the MCP connector, so Claude and ChatGPT can connect with a
 * "Connect" button and the user's own sign-in, instead of a pasted link.
 *
 * - Public clients only (no client secret), PKCE with S256 required.
 * - Clients register themselves (RFC 7591), as Claude and ChatGPT do.
 * - Codes and tokens are random and stored only as SHA-256 hashes.
 */

export const OAUTH_SCOPE = "link";
export const ACCESS_TOKEN_TTL_S = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 60; // 60 days
export const MCP_PATH = "/api/mcp";

export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

/** The site's public origin, as the client reached it. */
export function siteOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export function resourceUrl(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

/** Headers for every OAuth response: never cached, callable from any origin. */
export const OAUTH_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function oauthJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: OAUTH_HEADERS });
}

export function oauthError(error: string, description: string, status = 400): Response {
  return oauthJson({ error, error_description: description }, status);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_HEADERS });
}

/** Reads a token or registration request sent as a form or as JSON. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(json)) if (typeof v === "string") out[k] = v;
    return out;
  }
  const form = new URLSearchParams(await request.text());
  for (const [k, v] of form) out[k] = v;
  return out;
}

const isLoopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

/**
 * Allowed redirect URIs: https anywhere, or http on this computer (Claude Code
 * and other local clients). No fragments, no credentials in the URL.
 */
export function isAllowedRedirectUri(raw: string): boolean {
  if (raw.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && isLoopback(url.hostname);
}

/** Exact match, except that loopback redirects may use any port (RFC 8252). */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.protocol !== "http:" || !isLoopback(req.hostname)) return false;
  return registered.some((r) => {
    try {
      const reg = new URL(r);
      return (
        reg.protocol === "http:" &&
        reg.hostname === req.hostname &&
        reg.pathname === req.pathname &&
        reg.search === req.search
      );
    } catch {
      return false;
    }
  });
}

/** PKCE S256: base64url(sha256(verifier)) must equal the challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!/^lkc_[A-Za-z0-9_-]{16,80}$/.test(clientId)) return null;
  const { data } = await createAdminClient()
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as OAuthClient | null) ?? null;
}

/** Issues a new access and refresh token pair for a user and client. */
export async function issueTokens(clientId: string, userId: string, scope: string) {
  const accessToken = randomToken("lka_");
  const refreshToken = randomToken("lkr_");
  const now = Date.now();
  const { error } = await createAdminClient()
    .from("oauth_tokens")
    .insert({
      client_id: clientId,
      user_id: userId,
      access_hash: sha256Hex(accessToken),
      refresh_hash: sha256Hex(refreshToken),
      scope,
      access_expires_at: new Date(now + ACCESS_TOKEN_TTL_S * 1000).toISOString(),
      refresh_expires_at: new Date(now + REFRESH_TOKEN_TTL_S * 1000).toISOString(),
    });
  if (error) throw new Error(error.message);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refreshToken,
    scope,
  };
}

/**
 * Who is calling the MCP endpoint: an OAuth access token (lka_...) from the
 * Connect flow, or a personal connector token (lk_...) from Settings.
 */
export async function userFromBearer(request: Request): Promise<string | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;

  if (/^lka_[A-Za-z0-9_-]{40,60}$/.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("oauth_tokens")
      .select("id, user_id")
      .eq("access_hash", sha256Hex(token))
      .is("revoked_at", null)
      .gt("access_expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data) return null;
    void admin.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
    return data.user_id as string;
  }

  if (/^lk_[A-Za-z0-9_-]{40,60}$/.test(token)) return userFromPersonalToken(token);
  return null;
}

/** Personal connector token, as created in Settings. */
export async function userFromPersonalToken(token: string): Promise<string | null> {
  if (!/^lk_[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("api_tokens")
    .select("id, user_id")
    .eq("token_hash", sha256Hex(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  void admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id as string;
}