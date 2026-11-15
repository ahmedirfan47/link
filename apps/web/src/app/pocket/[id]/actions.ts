"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sanitizeGeneratedCue } from "@link/core";
import { requireUser } from "@/lib/supabase/server";

/**
 * Pocket actions. They change the owner's own cards only: RLS refuses any
 * write to a pack the user does not own, so teammates cannot use them.
 */

const Uuid = z.uuid();

/** "This card helped": counted, and helpful cards rank higher next time. */
export async function markUseful(packId: string, cueId: string): Promise<{ count?: number; error?: string }> {
  if (!Uuid.safeParse(packId).success || !Uuid.safeParse(cueId).success) return { error: "Invalid card." };
  const { supabase } = await requireUser();
  const { data } = await supabase.from("cues").select("useful_count").eq("id", cueId).eq("pack_id", packId).maybeSingle();
  if (!data) return { error: "Only the pack owner can mark cards." };
  const count = (data.useful_count as number) + 1;
  const { error } = await supabase
    .from("cues")
    .update({ useful_count: count, last_useful_at: new Date().toISOString() })
    .eq("id", cueId);
  if (error) return { error: error.message };
  revalidatePath(`/packs/${packId}`);
  return { count };
}

/** Hide a card that did not help: it stops being used live until approved again. */
export async function hideCard(packId: string, cueId: string): Promise<{ error?: string }> {
  if (!Uuid.safeParse(packId).success || !Uuid.safeParse(cueId).success) return { error: "Invalid card." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("cues")
    .update({ approved: false })
    .eq("id", cueId)
    .eq("pack_id", packId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Only the pack owner can hide cards." };
  revalidatePath(`/packs/${packId}`);
  return {};
}

/** Keep Grok's answer to an unprepared question as an approved card. */
export async function saveAnswerAsCard(
  packId: string,
  question: string,
  bullets: string[],
): Promise<{ id?: string; error?: string }> {
  if (!Uuid.safeParse(packId).success) return { error: "Invalid pack." };
  const cue = sanitizeGeneratedCue({
    direction: "incoming",
    kind: "question",
    prompt: question,
    variants: [],
    bullets,
    keywords: [],
    priority: 1,
  });
  if (!cue) return { error: "Nothing to save." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("cues")
    .insert({ pack_id: packId, ...cue, approved: true })
    .select("id")
    .single();
  if (error || !data) return { error: "Only the pack owner can add cards." };
  revalidatePath(`/packs/${packId}`);
  return { id: data.id as string };
}
