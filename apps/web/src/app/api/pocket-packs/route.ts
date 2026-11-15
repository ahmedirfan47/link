import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { json } from "@/lib/pocket-api";

/** Every pack the signed-in user can open in Pocket: their own, shared with them, and their teams'. */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const email = String(claims?.claims?.email ?? "").toLowerCase();
  if (!userId) return json({ error: "Sign in to Link first." }, 401);

  const [{ data: own }, { data: shares }, { data: teams }] = await Promise.all([
    supabase
      .from("packs")
      .select("id, title, meeting_type, language, meeting_at, updated_at")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false }),
    supabase.from("pack_shares").select("pack_id").eq("email", email),
    supabase.from("teams").select("id, name"),
  ]);

  const admin = createAdminClient();
  const sharedIds = [...new Set((shares ?? []).map((s) => s.pack_id as string))];
  const teamIds = (teams ?? []).map((t) => t.id as string);
  const [{ data: shared }, { data: teamPacks }] = await Promise.all([
    sharedIds.length
      ? admin.from("packs").select("id, title, meeting_type, language, meeting_at, updated_at").in("id", sharedIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? admin
          .from("packs")
          .select("id, title, meeting_type, language, meeting_at, updated_at, team_id, user_id")
          .in("team_id", teamIds)
          .neq("user_id", userId)
          .neq("status", "archived")
      : Promise.resolve({ data: [] }),
  ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const seen = new Set<string>();
  const packs = [
    ...(own ?? []).map((p) => ({ ...p, role: "owner", from: null as string | null })),
    ...(shared ?? []).map((p) => ({ ...p, role: "viewer", from: "Shared with you" })),
    ...((teamPacks ?? []) as { team_id: string }[]).map((p) => ({
      ...p,
      role: "viewer",
      from: teamName.get(p.team_id) ?? "Team",
    })),
  ].filter((p) => {
    const id = (p as { id: string }).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return json({ packs });
}
