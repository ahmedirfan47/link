import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { PackRow } from "@/lib/rows";

/**
 * Who may see a pack: its owner, a teammate it was shared with by email, or a
 * member of the team it belongs to. Everyone but the owner is read-only.
 * Non-owners cannot read packs or cues through the database directly; after
 * access is confirmed here, the server reads them with the admin client.
 */
export interface PackAccess {
  pack: PackRow;
  role: "owner" | "viewer";
  /** How a viewer got access. */
  via: "owner" | "share" | "team";
  userId: string;
  /** Client to read this pack's cues and sources with. */
  db: SupabaseClient;
}

async function resolve(supabase: SupabaseClient, userId: string, packId: string): Promise<PackAccess | null> {
  const { data: own } = await supabase.from("packs").select("*").eq("id", packId).eq("user_id", userId).maybeSingle();
  if (own) return { pack: own as PackRow, role: "owner", via: "owner", userId, db: supabase };

  const admin = createAdminClient();
  const { data: pack } = await admin.from("packs").select("*").eq("id", packId).maybeSingle();
  if (!pack) return null;

  // RLS only returns share rows addressed to this user's own email.
  const { data: share } = await supabase.from("pack_shares").select("id").eq("pack_id", packId).maybeSingle();
  if (share) return { pack: pack as PackRow, role: "viewer", via: "share", userId, db: admin };

  const teamId = (pack as PackRow).team_id;
  if (teamId) {
    const { data: member } = await supabase.rpc("is_team_member", { t: teamId });
    if (member === true) return { pack: pack as PackRow, role: "viewer", via: "team", userId, db: admin };
  }
  return null;
}

/** For pages and server actions: redirects to /login when signed out. */
export async function loadPackForViewer(packId: string): Promise<PackAccess | null> {
  const { supabase, userId } = await requireUser();
  return resolve(supabase, userId, packId);
}

/** For API routes: returns null when signed out instead of redirecting. */
export async function packAccessFromCookies(packId: string): Promise<PackAccess | null | "signed-out"> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return "signed-out";
  return resolve(supabase, userId, packId);
}
