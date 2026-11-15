import { z } from "zod";
import { AiError, answerFromSources } from "@/lib/ai";
import { loadPackForViewer } from "@/lib/pack-access";
import type { CueRow } from "@/lib/rows";
import { createClient } from "@/lib/supabase/server";
import { LimitError, consume } from "@/lib/usage";

/**
 * Pocket's "Ask Grok": three points for a question no card covers, from the
 * pack's sources and cards. Works for the owner and for teammates the pack
 * was shared with; the cost counts against whoever asks.
 */

export const maxDuration = 60;

const Body = z.object({
  packId: z.uuid(),
  question: z.string().trim().min(3).max(500),
});

const MAX_SOURCES = 20;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Sign in again." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Type or say the question first." }, { status: 400 });

  const access = await loadPackForViewer(parsed.data.packId);
  if (!access) return Response.json({ error: "Pack not found." }, { status: 404 });

  try {
    await consume(access.userId, "live_fallbacks");
    const [{ data: sourceRows }, { data: cueRows }] = await Promise.all([
      access.db
        .from("sources")
        .select("title, kind, content_text")
        .eq("pack_id", access.pack.id)
        .eq("status", "ready")
        .order("created_at", { ascending: true })
        .limit(MAX_SOURCES),
      access.db
        .from("cues")
        .select("prompt, bullets")
        .eq("pack_id", access.pack.id)
        .eq("approved", true)
        .order("priority", { ascending: true }),
    ]);
    const sources = (sourceRows ?? [])
      .filter((s) => s.content_text)
      .map((s) => ({ title: s.title as string, kind: s.kind as string, text: s.content_text as string }));
    const answer = await answerFromSources(
      access.pack,
      sources,
      (cueRows ?? []) as Pick<CueRow, "prompt" | "bullets">[],
      parsed.data.question,
    );
    return Response.json(answer, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof LimitError) return Response.json({ error: err.message }, { status: 429 });
    if (err instanceof AiError) return Response.json({ error: err.message }, { status: 502 });
    console.error(err);
    return Response.json({ error: "Could not get an answer. Try again." }, { status: 500 });
  }
}
