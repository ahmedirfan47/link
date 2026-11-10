import { z } from "zod";
import { HttpError, errorResponse, requireBearer } from "@/lib/supabase/bearer";

/** One pack with its approved cues, ready for the live engine. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new HttpError(400, "Invalid pack id.");
    const { supabase } = await requireBearer(request);

    const { data: pack } = await supabase
      .from("packs")
      .select("id, title, meeting_type, counterpart, goal, language, status")
      .eq("id", id)
      .maybeSingle();
    if (!pack) throw new HttpError(404, "Pack not found.");

    const { data: cues, error } = await supabase
      .from("cues")
      .select("id, direction, kind, prompt, variants, bullets, keywords, priority")
      .eq("pack_id", id)
      .eq("approved", true)
      .order("priority", { ascending: true });
    if (error) throw error;

    return Response.json({ pack, cues: cues ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}