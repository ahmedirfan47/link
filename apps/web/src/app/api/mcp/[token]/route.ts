import { handleMcpPost, rpcError } from "@/lib/mcp-server";
import { userFromPersonalToken } from "@/lib/oauth";

/**
 * MCP server with the personal token in the URL: https://<site>/api/mcp/<token>.
 * For clients without OAuth. The token comes from Settings and can be revoked there.
 * Clients that support OAuth should use https://<site>/api/mcp instead.
 */

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await userFromPersonalToken(token);
  if (!userId) {
    return Response.json(
      rpcError(null, -32001, "This connector link is invalid or was revoked. Create a new one in Link settings."),
      { status: 401 },
    );
  }
  return handleMcpPost(request, userId);
}

/** This server does not open server-to-client streams. */
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}