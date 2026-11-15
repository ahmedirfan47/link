"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AiError } from "@/lib/ai";
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
  await supabase.from("team_members").insert({ team_id: team.id, email, role: "owner" });
  revalidatePath("/teams");
  redirect(`/teams/${team.id}`);
}

export async function inviteMember(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!Uuid.safeParse(teamId).success) return { error: "Invalid team." };
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return { error: "Enter at least one email address." };
  const bad = emails.find((e) => !z.email().safeParse(e).success);
  if (bad) return { error: `${bad} is not a valid email address.` };

  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  if ((count ?? 0) + emails.length > MAX_MEMBERS) return { error: `A team can have up to ${MAX_MEMBERS} members.` };

  const { error } = await supabase
    .from("team_members")
    .upsert(
      emails.map((email) => ({ team_id: teamId, email, role: "member" })),
      { onConflict: "team_id,email", ignoreDuplicates: true },
    );
  if (error) return { error: "Only the team owner can add members." };
  revalidatePath(`/teams/${teamId}`);
  return {
    message: `Added ${emails.length === 1 ? emails[0] : `${emails.length} people`}. They see the team after signing in to Link with that email.`,
  };
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
  const { supabase } = await requireUser();
  const email = await ownEmail(supabase);
  // Members cannot delete rows through RLS; the server removes only the caller's own row.
  await createAdminClient().from("team_members").delete().eq("team_id", teamId).eq("email", email).neq("role", "owner");
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
