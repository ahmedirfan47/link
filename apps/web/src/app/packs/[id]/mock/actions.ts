"use server";

import { z } from "zod";
import { AiError, mockTurn, type MockTurn } from "@/lib/ai";
import { requireUser } from "@/lib/supabase/server";
import type { PackRow } from "@/lib/rows";
import { LimitError, consume } from "@/lib/usage";

const Input = z.object({
  packId: z.uuid(),
  cueId: z.uuid(),
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(3, "Say or type an answer first.").max(4000),
  followUp: z.boolean(),
});

/** Grades one answer in the mock conversation and, for a first answer, returns a follow-up question. */
export async function mockAnswer(input: {
  packId: string;
  cueId: string;
  question: string;
  answer: string;
  followUp: boolean;
}): Promise<{ turn?: MockTurn; error?: string }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const { supabase, userId } = await requireUser();
    const [{ data: pack }, { data: cue }] = await Promise.all([
      supabase.from("packs").select("*").eq("id", parsed.data.packId).maybeSingle(),
      supabase.from("cues").select("bullets").eq("id", parsed.data.cueId).eq("pack_id", parsed.data.packId).maybeSingle(),
    ]);
    if (!pack || !cue) return { error: "Question not found." };
    await consume(userId, "rehearsal_grades");
    // A follow-up is graded against the same prepared points as the question it presses on.
    const turn = await mockTurn(
      pack as PackRow,
      parsed.data.question,
      (cue.bullets as string[]) ?? [],
      parsed.data.answer,
      !parsed.data.followUp,
    );
    return { turn };
  } catch (err) {
    if (err instanceof LimitError || err instanceof AiError) return { error: err.message };
    return { error: "Could not check the answer. Try again." };
  }
}
