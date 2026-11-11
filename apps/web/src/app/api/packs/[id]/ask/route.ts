import { z } from "zod";
import { AiError, askStream } from "@/lib/ai";
import type { PackRow } from "@/lib/rows";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LimitError, consume } from "@/lib/usage";

/**
 * Ask: answers a question about the pack's sources with Grok and streams the
 * answer as plain text. Both sides of the conversation are saved.
 */

export const maxDuration = 120;

const Body = z.object({
  question: z.string().trim().min(1).max(4000),
  sourceId: z.uuid().optional(),
});

const HISTORY_TURNS = 12;

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, "Pack not found.");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return fail(401, "Sign in again.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Write a question first.");
  const { question, sourceId } = parsed.data;

  const { data: packData } = await supabase.from("packs").select("*").eq("id", id).maybeSingle();
  if (!packData) return fail(404, "Pack not found.");
  const pack = packData as PackRow;

  try {
    await consume(userId, "ask_messages");
  } catch (err) {
    if (err instanceof LimitError) return fail(429, err.message);
    throw err;
  }

  let sourceQuery = supabase
    .from("sources")
    .select("title, kind, content_text")
    .eq("pack_id", id)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (sourceId) sourceQuery = sourceQuery.eq("id", sourceId);
  const [{ data: sourceRows }, { data: historyRows }] = await Promise.all([
    sourceQuery,
    supabase
      .from("ask_messages")
      .select("role, content")
      .eq("pack_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS),
  ]);

  const sources = (sourceRows ?? [])
    .filter((s) => s.content_text)
    .map((s) => ({ title: s.title as string, kind: s.kind as string, text: s.content_text as string }));
  if (sourceId && sources.length === 0) return fail(404, "That source was not found.");
  const history = ((historyRows ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();

  const { error: saveError } = await supabase.from("ask_messages").insert({ pack_id: id, role: "user", content: question });
  if (saveError) return fail(500, saveError.message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        for await (const chunk of askStream(pack, sources, history, question)) {
          answer += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        if (answer.trim()) {
          await createAdminClient()
            .from("ask_messages")
            .insert({ pack_id: id, user_id: userId, role: "assistant", content: answer.slice(0, 40_000) });
        }
      } catch (err) {
        console.error(err);
        const message = err instanceof AiError ? err.message : "The answer stopped early. Try again.";
        controller.enqueue(encoder.encode(`${answer ? "\n\n" : ""}⚠ ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}