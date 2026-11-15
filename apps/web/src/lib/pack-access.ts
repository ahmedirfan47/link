import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import type { PackRow } from "@/lib/rows";

/**
 * Who may see a pack: its owner, or a teammate it was shared with (read-only).
 * Teammates cannot read packs or cues through the database directly; after the
 * share is confirmed here, the server reads them with the admin client.
 */
export interface PackAccess {
  pack: PackRow;
  role: "owner" | "viewer";
  userId: string;
  /** Client to read this pack's cues and sources with. */
  db: SupabaseClient;
}

export async function loadPackForViewer(packId: string): Promise<PackAccess | null> {
  const { supabase, userId } = await requireUser();
  const { data: own } = await supabase.from("packs").select("*").eq("id", packId).eq("user_id", userId).maybeSingle();
  if (own) return { pack: own as PackRow, role: "owner", userId, db: supabase };

  // RLS only returns share rows addressed to this user's own email.
  const { data: share } = await supabase.from("pack_shares").select("id").eq("pack_id", packId).maybeSingle();
  if (!share) return null;
  const admin = createAdminClient();
  const { data: pack } = await admin.from("packs").select("*").eq("id", packId).maybeSingle();
  if (!pack) return null;
  return { pack: pack as PackRow, role: "viewer", userId, db: admin };
}
