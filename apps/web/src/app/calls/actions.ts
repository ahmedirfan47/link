"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeText } from "@link/core";
import { AiError, draftCardsForQuestions } from "@/lib/ai";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState, PackRow } from "@/lib/rows";
import { LimitError, consume } from "@/lib/usage";

export async function deleteCall(callId: string): Promise<void> {
  if (!z.uuid().safeParse(callId).success) return;
  const { supabase } = await requireUser();
  // session_events are removed with the session (on delete cascade).
  await supabase.from("sessions").delete().eq("id", callId);
  revalidatePath("/calls");
  redirect("/calls");
}

const MAX_QUESTIONS = 15;

/**
 * Writes answers for the questions a call caught you out on, from the pack's
 * sources, and leaves them on the pack as cards to review and approve.
 */
export async function answerMissedQuestions(callId: string, _prev: ActionState): Promise<ActionState> {
  if (!z.uuid().safeParse(callId).success) return { error: "Invalid call." };
  const { supabase, userId } = await requireUser();

  const { data: call } = await supabase.from("sessions").select("id, pack_id").eq("id", callId).maybeSingle();
  if (!call?.pack_id) return { error: "The pack for this call was deleted." };
  const { data: packData } = await supabase.from("packs").select("*").eq("id", call.pack_id).maybeSingle();
  if (!packData) return { error: "The pack for this call was deleted." };
  const pack = packData as PackRow;

  const { data: events } = await supabase
    .from("session_events")
    .select("payload")
    .eq("session_id", callId)
    .eq("type", "unmatched_question")
    .order("t_ms", { ascending: true });
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const e of events ?? []) {
    const q = String((e.payload as { question?: unknown })?.question ?? "").trim();
    const key = normalizeText(q);
    if (q.length < 3 || !key || seen.has(key)) continue;
    seen.add(key);
    questions.push(q.slice(0, 300));
  }
  if (questions.length === 0) return { error: "No questions to answer." };

  // Skip questions the pack already answers (an approved card, or one with bullets).
  const { data: existing } = await supabase.from("cues").select("id, prompt, bullets, approved").eq("pack_id", pack.id);
  const byPrompt = new Map((existing ?? []).map((c) => [normalizeText(String(c.prompt)), c]));
  const todo = questions
    .filter((q) => {
      const c = byPrompt.get(normalizeText(q));
      return !c || (!c.approved && ((c.bullets as string[] | null) ?? []).length === 0);
    })
    .slice(0, MAX_QUESTIONS);
  if (todo.length === 0) return { message: "These questions already have answers in the pack." };

  try {
    await consume(userId, "answer_cues", todo.length);
    const { data: sourceRows } = await supabase
      .from("sources")
      .select("title, kind, content_text")
      .eq("pack_id", pack.id)
      .eq("status", "ready")
      .order("created_at", { ascending: true })
      .limit(20);
    const sources = (sourceRows ?? [])
      .filter((s) => s.content_text)
      .map((s) => ({ title: s.title as string, kind: s.kind as string, text: s.content_text as string }));
    const cards = await draftCardsForQuestions(pack, sources, todo);

    let written = 0;
    for (const [i, card] of cards.entries()) {
      const question = todo[i] ?? card.prompt;
      const current = byPrompt.get(normalizeText(question));
      const fields = { ...card, prompt: current ? String(current.prompt) : card.prompt, approved: false };
      const { error } = current
        ? await supabase.from("cues").update(fields).eq("id", current.id as string)
        : await supabase.from("cues").insert({ pack_id: pack.id, ...fields });
      if (!error) written += 1;
    }
    revalidatePath(`/packs/${pack.id}`);
    revalidatePath(`/calls/${callId}`);
    return {
      message: `${written} card${written === 1 ? "" : "s"} written. Review and approve them on the pack.`,
    };
  } catch (err) {
    if (err instanceof LimitError || err instanceof AiError) return { error: err.message };
    console.error(err);
    return { error: "Could not write the answers. Try again." };
  }
}
