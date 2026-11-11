import "server-only";
import { TOOLS, toolList } from "@/lib/mcp-tools";
import { createAdminClient } from "@/lib/supabase/admin";
import { LimitError, consume } from "@/lib/usage";

/**
 * Link as a remote MCP server (Streamable HTTP, stateless, JSON responses).
 * Shared by /api/mcp (OAuth "Connect") and /api/mcp/<token> (pasted link).
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "link", title: "Link", version: "0.3.0" };
const INSTRUCTIONS =
  "Link prepares the user for live conversations. A pack holds the material for one conversation and the cues " +
  "(likely questions with short answer bullets) shown during the call. Use list_packs to find a pack, get_pack to " +
  "read it, add_source to save useful material from this chat into a pack, and add_cue for specific questions and " +
  "answers. New cues need the user's approval on the website before they are used live.";

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
export const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(req: RpcRequest, userId: string, origin: string): Promise<object | null> {
  const isNotification = req.id === undefined || req.id === null;

  switch (req.method) {
    case "initialize": {
      const asked = String(req.params?.protocolVersion ?? "");
      return rpcResult(req.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(req.id, {});
    case "tools/list":
      return rpcResult(req.id, { tools: toolList() });
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(req.id, -32602, `Unknown tool: ${name}`);
      try {
        await consume(userId, "mcp_calls");
        const output = await tool.run(req.params?.arguments ?? {}, { admin: createAdminClient(), userId, origin });
        return rpcResult(req.id, {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: Array.isArray(output) ? { items: output } : output,
        });
      } catch (err) {
        const message =
          err instanceof LimitError
            ? err.message
            : err instanceof Error
              ? err.message.slice(0, 500)
              : "The tool failed.";
        return rpcResult(req.id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      if (isNotification) return null; // e.g. notifications/initialized
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

/** Runs one HTTP POST of JSON-RPC messages for an authenticated user. */
export async function handleMcpPost(request: Request, userId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const messages = (Array.isArray(body) ? body : [body]) as RpcRequest[];
  const responses: object[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || typeof message.method !== "string") {
      responses.push(rpcError(null, -32600, "Invalid request"));
      continue;
    }
    const response = await handle(message, userId, origin);
    if (response) responses.push(response);
  }

  // Notifications only: acknowledge with no body.
  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0], {
    headers: { "Cache-Control": "no-store" },
  });
}