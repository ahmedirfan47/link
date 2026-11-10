import { z } from "zod";
import { fallbackCue } from "@/lib/ai";
import { HttpError, errorResponse, requireBearer } from "@/lib/supabase/bearer";
import type { CueRow, PackRow } from "@/lib/rows";
import { consume } from "@/lib/usage";

const BodySchema = z.object({
  packId: z.uuid(),
  question: z.string().trim().min(3).max(1000),
});

/** A quick "unprepared" cue for a question the pack did not cover. */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireBearer(request);
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const { packId, question } = parsed.data;

    const [{ data: pack }, { data: cues }] = await Promise.all([
      supabase.from("packs").select("*").eq("id", packId).maybeSingle(),
      supabase
        .from("cues")
        .select("prompt, bullets")
        .eq("pack_id", packId)
        .eq("approved", true)
        .order("priority", { ascending: true }),
    ]);
    if (!pack) throw new HttpError(404, "Pack not found.");
    await consume(userId, "live_fallbacks");

    const cue = await fallbackCue(
      pack as PackRow,
      (cues ?? []) as Pick<CueRow, "prompt" | "bullets">[],
      question,
    );
    return Response.json({ question, ...cue });
  } catch (err) {
    return errorResponse(err);
  }
}