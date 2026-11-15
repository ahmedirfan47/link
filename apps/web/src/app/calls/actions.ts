"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AiError } from "@/lib/ai";
import { writeAnswersForQuestions } from "@/lib/missed";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState, PackRow } from "@/lib/rows";
import { LimitError } from "@/lib/usage";

export async function deleteCall(callId: string): Promise<void> {
  if (!z.uuid().safeParse(callId).success) return;
  const { supabase } = await requireUser();
  // session_events are removed with the session (on delete cascade).
  await supabase.from("sessions").delete().eq("id", callId);
  revalidatePath("/calls");
  redirect("/calls");
}

/**
 * Writes answers for the questions a call caught you out on, from the pack's
 * sources, and leaves them on the pack as cards to review and approve.
 */
export async function answerMissedQuestions(callId: string, _prev: ActionState): Promise<ActionState> {
  if (!z.uuid().safeParse(callId).success) return { error: "Invalid call." };
  const { supabase, userId } = await requireUser();

  const { data: call } = await supabase.from("sessions").select("id, pack_id").eq("id", callId).maybeSingle();
  if (!call?.pack_id) return { error: "The pack for this call was deleted." };
  const { data: pack } = await supabase.from("packs").select("*").eq("id", call.pack_id).maybeSingle();
  if (!pack) return { error: "The pack for this call was deleted." };

  const { data: events } = await supabase
    .from("session_events")
    .select("payload")
    .eq("session_id", callId)
    .eq("type", "unmatched_question")
    .order("t_ms", { ascending: true });
  const questions = (events ?? []).map((e) => String((e.payload as { question?: unknown })?.question ?? ""));
  if (questions.every((q) => q.trim().length < 3)) return { error: "No questions to answer." };

  try {
    const { written, skipped } = await writeAnswersForQuestions(supabase, userId, pack as PackRow, questions);
    if (skipped) return { message: "These questions already have answers in the pack." };
    revalidatePath(`/packs/${pack.id}`);
    revalidatePath(`/calls/${callId}`);
    return { message: `${written} card${written === 1 ? "" : "s"} written. Review and approve them on the pack.` };
  } catch (err) {
    if (err instanceof LimitError || err instanceof AiError) return { error: err.message };
    console.error(err);
    return { error: "Could not write the answers. Try again." };
  }
}
