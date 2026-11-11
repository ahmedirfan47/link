import { handleMcpPost } from "@/lib/mcp-server";
import { OAUTH_HEADERS, preflight, protectedResourceMetadataUrl, siteOrigin, userFromBearer } from "@/lib/oauth";

/**
 * MCP server with OAuth: https://<site>/api/mcp. Claude and ChatGPT discover
 * the sign-in from the 401 below, register, send the user to Link to approve,
 * and then call this endpoint with "Authorization: Bearer <access token>".
 */

export const maxDuration = 60;

function unauthorized(request: Request, description: string): Response {
  const metadata = protectedResourceMetadataUrl(siteOrigin(request));
  return Response.json(
    { error: "invalid_token", error_description: description },
    {
      status: 401,
      headers: {
        ...OAUTH_HEADERS,
        "WWW-Authenticate": `Bearer resource_metadata="${metadata}", error="invalid_token", error_description="${description}"`,
      },
    },
  );
}

export async function POST(request: Request) {
  const hasToken = /^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "");
  const userId = await userFromBearer(request);
  if (!userId) return unauthorized(request, hasToken ? "The access token is invalid or expired." : "Sign in to Link to connect.");
  const response = await handleMcpPost(request, userId);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}

/** This server does not open server-to-client streams. */
export async function GET(request: Request) {
  const userId = await userFromBearer(request);
  if (!userId) return unauthorized(request, "Sign in to Link to connect.");
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function OPTIONS() {
  return preflight();
}