import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "@link/core";
import { draftCardsForQuestions } from "@/lib/ai";
import type { PackRow } from "@/lib/rows";
import { consume } from "@/lib/usage";

const MAX_QUESTIONS = 15;

/**
 * Writes answers for questions a pack was not ready for, from the pack's
 * sources, and leaves them on the pack as cards to review. Questions the pack
 * already answers are skipped. `supabase` must act as the pack's owner.
 */
export async function writeAnswersForQuestions(
  supabase: SupabaseClient,
  userId: string,
  pack: PackRow,
  questions: string[],
): Promise<{ written: number; skipped: boolean }> {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of questions) {
    const q = raw.trim().slice(0, 300);
    const key = normalizeText(q);
    if (q.length < 3 || !key || seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
  }

  const { data: existing } = await supabase.from("cues").select("id, prompt, bullets, approved").eq("pack_id", pack.id);
  const byPrompt = new Map((existing ?? []).map((c) => [normalizeText(String(c.prompt)), c]));
  const todo = unique
    .filter((q) => {
      const c = byPrompt.get(normalizeText(q));
      return !c || (!c.approved && ((c.bullets as string[] | null) ?? []).length === 0);
    })
    .slice(0, MAX_QUESTIONS);
  if (todo.length === 0) return { written: 0, skipped: true };

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
  return { written, skipped: false };
}
