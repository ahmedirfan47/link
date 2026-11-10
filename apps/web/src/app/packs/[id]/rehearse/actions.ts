"use server";

import { z } from "zod";
import { gradeAnswer, type Grade } from "@/lib/ai";
import { requireUser } from "@/lib/supabase/server";
import type { CueRow, PackRow } from "@/lib/rows";

export interface GradeResult {
  grade?: Grade;
  error?: string;
}

const InputSchema = z.object({
  packId: z.uuid(),
  cueId: z.uuid(),
  answer: z.string().trim().min(3, "Say or type an answer first.").max(4000),
});

export async function gradeRehearsal(packId: string, cueId: string, answer: string): Promise<GradeResult> {
  const parsed = InputSchema.safeParse({ packId, cueId, answer });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const { supabase } = await requireUser();
    const [{ data: pack }, { data: cue }] = await Promise.all([
      supabase.from("packs").select("*").eq("id", packId).single(),
      supabase.from("cues").select("prompt, bullets").eq("id", cueId).eq("pack_id", packId).single(),
    ]);
    if (!pack || !cue) return { error: "Cue not found." };
    const grade = await gradeAnswer(pack as PackRow, cue as Pick<CueRow, "prompt" | "bullets">, parsed.data.answer);
    return { grade };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the answer." };
  }
}