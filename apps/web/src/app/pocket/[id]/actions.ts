"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadPackForViewer } from "@/lib/pack-access";
import { hideCard as hide, logMiss, saveCard, starCard } from "@/lib/pocket";

/**
 * Pocket actions for the web window. Anyone who can see the pack can star a
 * card and log a missed question; only the owner can hide or add cards.
 */

const Uuid = z.uuid();

async function access(packId: string) {
  if (!Uuid.safeParse(packId).success) throw new Error("Invalid pack.");
  const a = await loadPackForViewer(packId);
  if (!a) throw new Error("Pack not found.");
  return a;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** "This card helped": counted, and helpful cards rank higher next time. */
export async function markUseful(packId: string, cueId: string): Promise<{ count?: number; error?: string }> {
  try {
    if (!Uuid.safeParse(cueId).success) return { error: "Invalid card." };
    const count = await starCard(await access(packId), cueId);
    revalidatePath(`/packs/${packId}`);
    return { count };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Hide a card that did not help: it stops being used live until approved again. */
export async function hideCard(packId: string, cueId: string): Promise<{ error?: string }> {
  try {
    if (!Uuid.safeParse(cueId).success) return { error: "Invalid card." };
    await hide(await access(packId), cueId);
    revalidatePath(`/packs/${packId}`);
    return {};
  } catch (err) {
    return { error: message(err) };
  }
}

/** Keep Grok's answer to an unprepared question as an approved card. */
export async function saveAnswerAsCard(
  packId: string,
  question: string,
  bullets: string[],
): Promise<{ id?: string; error?: string }> {
  try {
    const id = await saveCard(await access(packId), question, bullets);
    revalidatePath(`/packs/${packId}`);
    return { id };
  } catch (err) {
    return { error: message(err) };
  }
}

/** A question was heard and no card covered it. */
export async function recordMiss(packId: string, question: string): Promise<void> {
  try {
    await logMiss(await access(packId), question, "pocket");
  } catch {
    /* best effort */
  }
}
