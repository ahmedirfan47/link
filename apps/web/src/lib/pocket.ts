import "server-only";
import { sanitizeGeneratedCue } from "@link/core";
import type { PackAccess } from "@/lib/pack-access";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What Pocket, the web window and the Chrome extension can do to a pack's
 * cards. Access is checked by the caller (loadPackForViewer); writes that a
 * viewer may make go through the admin client.
 */

export interface PocketCard {
  id: string;
  direction: "incoming" | "outgoing";
  kind: "question" | "topic" | "number" | "checklist";
  prompt: string;
  variants: string[];
  bullets: string[];
  keywords: string[];
  priority: number;
  useful: number;
}

export async function pocketCards(access: PackAccess): Promise<PocketCard[]> {
  const { data } = await access.db
    .from("cues")
    .select("id, direction, kind, prompt, variants, bullets, keywords, priority, useful_count")
    .eq("pack_id", access.pack.id)
    .eq("approved", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []).map(({ useful_count, ...c }) => ({ ...c, useful: useful_count as number }) as PocketCard);
}

/** "This card helped". Anyone who can see the pack may star; stars are pooled for the team. */
export async function starCard(access: PackAccess, cueId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: cue } = await admin
    .from("cues")
    .select("useful_count")
    .eq("id", cueId)
    .eq("pack_id", access.pack.id)
    .eq("approved", true)
    .maybeSingle();
  if (!cue) throw new Error("Card not found.");
  const count = (cue.useful_count as number) + 1;
  await admin.from("cues").update({ useful_count: count, last_useful_at: new Date().toISOString() }).eq("id", cueId);
  await admin.from("card_stars").insert({ cue_id: cueId, pack_id: access.pack.id, user_id: access.userId });
  return count;
}

/** Takes a card out of live use. Owner only. */
export async function hideCard(access: PackAccess, cueId: string): Promise<void> {
  if (access.role !== "owner") throw new Error("Only the pack owner can hide cards.");
  const { data, error } = await access.db
    .from("cues")
    .update({ approved: false })
    .eq("id", cueId)
    .eq("pack_id", access.pack.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Card not found.");
}

/** Saves an answer as an approved card. Owner only. */
export async function saveCard(access: PackAccess, question: string, bullets: string[]): Promise<string> {
  if (access.role !== "owner") throw new Error("Only the pack owner can add cards.");
  const cue = sanitizeGeneratedCue({
    direction: "incoming",
    kind: "question",
    prompt: question,
    variants: [],
    bullets,
    keywords: [],
    priority: 1,
  });
  if (!cue) throw new Error("Nothing to save.");
  const { data, error } = await access.db
    .from("cues")
    .insert({ pack_id: access.pack.id, ...cue, approved: true })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not save the card.");
  return data.id as string;
}

/** Records a question nobody had a card for; it feeds "questions you weren't ready for" and the team playbook. */
export async function logMiss(access: PackAccess, question: string, source: "pocket" | "extension"): Promise<void> {
  const text = question.trim().replace(/\s+/g, " ").slice(0, 300);
  if (text.length < 3) return;
  const admin = createAdminClient();
  // One row per question per person per hour is enough.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("pocket_misses")
    .select("id")
    .eq("pack_id", access.pack.id)
    .eq("user_id", access.userId)
    .eq("question", text)
    .gt("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return;
  await admin.from("pocket_misses").insert({ pack_id: access.pack.id, user_id: access.userId, question: text, source });
}
