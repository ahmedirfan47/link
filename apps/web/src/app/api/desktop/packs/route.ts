import { errorResponse, requireBearer } from "@/lib/supabase/bearer";

/** Packs the signed-in user can take into a live call, newest first. */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireBearer(request);
    const { data, error } = await supabase
      .from("packs")
      .select("id, title, meeting_type, counterpart, language, status, updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json({ packs: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}