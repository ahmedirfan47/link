"use server";

import { redirect } from "next/navigation";
import { hashInviteToken, isInviteToken } from "@/lib/invites";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

const USED = "This invite link was already used or has been replaced. Ask for a new one.";

/**
 * Accepts an invite: the signed-in account becomes the one the share or team
 * seat belongs to. The token is cleared so the link works only once.
 */
export async function acceptInvite(token: string): Promise<{ error?: string }> {
  if (!isInviteToken(token)) return { error: "This invite link is not valid." };
  const { userId } = await requireUser();
  const admin = createAdminClient();
  const hash = hashInviteToken(token);
  const accepted = { accepted_by: userId, accepted_at: new Date().toISOString(), token_hash: null };

  const { data: share } = await admin.from("pack_shares").select("id, pack_id, owner_id").eq("token_hash", hash).maybeSingle();
  if (share) {
    if (share.owner_id === userId) return { error: "This is your own invite. Send the link to your teammate." };
    const { data } = await admin.from("pack_shares").update(accepted).eq("id", share.id).is("accepted_by", null).select("id");
    if (!data?.length) return { error: USED };
    redirect(`/shared/${share.pack_id}`);
  }

  const { data: seat } = await admin.from("team_members").select("id, team_id").eq("token_hash", hash).maybeSingle();
  if (seat) {
    const [{ data: team }, { data: existing }] = await Promise.all([
      admin.from("teams").select("owner_id").eq("id", seat.team_id).maybeSingle(),
      admin.from("team_members").select("id").eq("team_id", seat.team_id).eq("accepted_by", userId).limit(1),
    ]);
    // Already on the team: open it and leave the invite for the person it was meant for.
    if (team?.owner_id === userId || (existing?.length ?? 0) > 0) redirect(`/teams/${seat.team_id}`);
    const { data } = await admin.from("team_members").update(accepted).eq("id", seat.id).is("accepted_by", null).select("id");
    if (!data?.length) return { error: USED };
    redirect(`/teams/${seat.team_id}`);
  }

  return { error: USED };
}
