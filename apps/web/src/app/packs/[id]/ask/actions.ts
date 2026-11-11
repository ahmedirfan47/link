"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

/** Deletes the Ask conversation of one pack. RLS limits it to the user's own rows. */
export async function clearAsk(packId: string): Promise<void> {
  if (!z.uuid().safeParse(packId).success) return;
  const { supabase } = await requireUser();
  await supabase.from("ask_messages").delete().eq("pack_id", packId);
  revalidatePath(`/packs/${packId}/ask`);
}