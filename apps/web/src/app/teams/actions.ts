"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AiError } from "@/lib/ai";
import { newInvite } from "@/lib/invites";
import { writeAnswersForQuestions } from "@/lib/missed";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState, PackRow } from "@/lib/rows";
import { LimitError } from "@/lib/usage";

const Uuid = z.uuid();
const MAX_MEMBERS = 50;

async function ownEmail(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]): Promise<string> {
  const { data } = await supabase.auth.getClaims();
  return String(data?.claims?.email ?? "").toLowerCase();
}

export async function createTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 80) return { error: "Give the team a name (up to 80 characters)." };
  const { supabase, userId } = await requireUser();
  const email = await ownEmail(supabase);
  const { data: team, error } = await supabase.from("teams").insert({ name, owner_id: userId }).select("id").single();
  if (error || !team) return { error: error?.message ?? "Could not create the team." };
  await supabase
    .from("team_members")
    .insert({ team_id: team.id, email, role: "owner", accepted_by: userId, accepted_at: new Date().toISOString() });
  revalidatePath("/teams");
  redirect(`/teams/${team.id}`);
}

/** Adds a seat for a teammate and returns its invite link; they join by accepting it signed in. */
export async function inviteMember(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!Uuid.safeParse(teamId).success) return { error: "Invalid team." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address." };

  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  if ((count ?? 0) >= MAX_MEMBERS) return { error: `A team can have up to ${MAX_MEMBERS} members.` };

  const invite = await newInvite();
  const { error } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, email, role: "member", token_hash: invite.hash });
  if (error) {
    if (error.code === "23505") return { error: "That email is already on the team." };
    return { error: "Only the team owner can add members." };
  }
  revalidatePath(`/teams/${teamId}`);
  return {
    message: `Invite for ${email} created. Send them this link; it works once, after they sign in to Link.`,
    inviteUrl: invite.url,
  };
}

/** A fresh invite link for a seat nobody has accepted yet (the old link stops working). */
export async function newMemberLink(teamId: string, memberId: string): Promise<{ url?: string; error?: string }> {
  if (!Uuid.safeParse(teamId).success || !Uuid.safeParse(memberId).success) return { error: "Invalid invite." };
  const { supabase } = await requireUser();
  const invite = await newInvite();
  const { data, error } = await supabase
    .from("team_members")
    .update({ token_hash: invite.hash })
    .eq("id", memberId)
    .eq("team_id", teamId)
    .is("accepted_by", null)
    .select("id");
  if (error || !data?.length) return { error: "Already joined" };
  return { url: invite.url };
}

export async function removeMember(teamId: string, memberId: string): Promise<void> {
  if (!Uuid.safeParse(teamId).success || !Uuid.safeParse(memberId).success) return;
  const { supabase } = await requireUser();
  await supabase.from("team_members").delete().eq("id", memberId).eq("team_id", teamId).neq("role", "owner");
  revalidatePath(`/teams/${teamId}`);
}

/** A member leaves a team they were added to. */
export async function leaveTeam(teamId: string): Promise<void> {
  if (!Uuid.safeParse(teamId).success) return;
  // Members cannot delete rows through RLS; the server removes only the caller's own seat.
  const { userId } = await requireUser();
  await createAdminClient()
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("accepted_by", userId)
    .neq("role", "owner");
  revalidatePath("/teams");
  redirect("/teams");
}

export async function deleteTeam(teamId: string): Promise<void> {
  if (!Uuid.safeParse(teamId).success) return;
  const { supabase } = await requireUser();
  // Packs stay with their owners; they just stop being shared with the team.
  await supabase.from("teams").delete().eq("id", teamId);
  revalidatePath("/teams");
  redirect("/teams");
}

/** From the playbook: Grok drafts answers for one of your packs' missed questions. */
export async function answerTeamMisses(
  teamId: string,
  packId: string,
  questions: string[],
  _prev: ActionState,
): Promise<ActionState> {
  if (!Uuid.safeParse(packId).success) return { error: "Invalid pack." };
  const { supabase, userId } = await requireUser();
  const { data: pack } = await supabase.from("packs").select("*").eq("id", packId).eq("user_id", userId).maybeSingle();
  if (!pack) return { error: "Only the pack owner can add cards." };
  try {
    const { written, skipped } = await writeAnswersForQuestions(supabase, userId, pack as PackRow, questions.slice(0, 15));
    if (skipped) return { message: "These already have answers in the pack." };
    revalidatePath(`/teams/${teamId}`);
    revalidatePath(`/packs/${packId}`);
    return { message: `${written} card${written === 1 ? "" : "s"} written for review on the pack.` };
  } catch (err) {
    if (err instanceof LimitError || err instanceof AiError) return { error: err.message };
    console.error(err);
    return { error: "Could not write the answers. Try again." };
  }
}
