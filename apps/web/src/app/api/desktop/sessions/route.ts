import { z } from "zod";
import { HttpError, errorResponse, requireBearer } from "@/lib/supabase/bearer";
import { consume } from "@/lib/usage";

const BodySchema = z.object({
  packId: z.uuid().nullable(),
  title: z.string().trim().max(200).default(""),
});

/** Starts a live session (one per call). */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireBearer(request);
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    await consume(userId, "live_sessions");

    const { data, error } = await supabase
      .from("sessions")
      .insert({ pack_id: parsed.data.packId, title: parsed.data.title })
      .select("id, started_at")
      .single();
    if (error || !data) throw error ?? new Error("Could not start the session.");
    return Response.json({ session: data });
  } catch (err) {
    return errorResponse(err);
  }
}