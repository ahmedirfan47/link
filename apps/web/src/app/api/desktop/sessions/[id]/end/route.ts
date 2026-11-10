import { z } from "zod";
import { SessionEventTypeSchema, normalizeText } from "@link/core";
import { summarizeSession, type SessionSummary } from "@/lib/ai";
import { HttpError, errorResponse, requireBearer } from "@/lib/supabase/bearer";
import type { PackRow } from "@/lib/rows";

export const maxDuration = 120;

const BodySchema = z.object({
  events: z
    .array(
      z.object({
        tMs: z.number().int().nonnegative(),
        type: SessionEventTypeSchema,
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .max(2_000),
  /** Sent only when the user chose to get a summary. Used once, never stored. */
  transcript: z
    .array(z.object({ speaker: z.enum(["them", "you"]), text: z.string().max(5_000) }))
    .max(5_000)
    .optional(),
  unmatchedQuestions: z.array(z.string().trim().min(3).max(300)).max(100).default([]),
});

/**
 * Ends a live session: stores its events, writes a summary if asked,
 * and adds the questions the pack missed as suggested cues for next time.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new HttpError(400, "Invalid session id.");
    const { supabase } = await requireBearer(request);
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const body = parsed.data;

    const { data: session } = await supabase
      .from("sessions")
      .select("id, pack_id, ended_at")
      .eq("id", id)
      .maybeSingle();
    if (!session) throw new HttpError(404, "Session not found.");

    if (body.events.length > 0) {
      const { error } = await supabase
        .from("session_events")
        .insert(body.events.map((e) => ({ session_id: id, t_ms: e.tMs, type: e.type, payload: e.payload })));
      if (error) throw error;
    }

    let pack: PackRow | null = null;
    if (session.pack_id) {
      const { data } = await supabase.from("packs").select("*").eq("id", session.pack_id).maybeSingle();
      pack = (data as PackRow | null) ?? null;
    }

    // Learning: questions the pack missed become suggested (unapproved) cues.
    let suggested = 0;
    if (pack && body.unmatchedQuestions.length > 0) {
      const { data: existing } = await supabase.from("cues").select("prompt").eq("pack_id", pack.id);
      const known = new Set((existing ?? []).map((c) => normalizeText(String(c.prompt))));
      const fresh: string[] = [];
      for (const q of body.unmatchedQuestions) {
        const key = normalizeText(q);
        if (key.length === 0 || known.has(key)) continue;
        known.add(key);
        fresh.push(q);
      }
      if (fresh.length > 0) {
        const { error } = await supabase.from("cues").insert(
          fresh.map((prompt) => ({
            pack_id: pack!.id,
            direction: "incoming",
            kind: "question",
            prompt,
            priority: 1,
            approved: false,
          })),
        );
        if (!error) suggested = fresh.length;
      }
    }

    let summary: SessionSummary | null = null;
    if (body.transcript && body.transcript.length > 0) {
      const hesitations = body.events
        .filter((e) => e.type === "hesitation")
        .map((e) => String(e.payload.context ?? e.payload.prompt ?? ""))
        .filter(Boolean);
      summary = await summarizeSession(pack, body.transcript, hesitations);
    }

    const summaryText = summary
      ? [
          summary.summary,
          summary.followUps.length ? `Follow-ups:\n- ${summary.followUps.join("\n- ")}` : "",
          summary.practice.length ? `Practice:\n- ${summary.practice.join("\n- ")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : null;

    await supabase
      .from("sessions")
      .update({ ended_at: new Date().toISOString(), summary: summaryText })
      .eq("id", id);

    return Response.json({ summary, suggestedCues: suggested });
  } catch (err) {
    return errorResponse(err);
  }
}