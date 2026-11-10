"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MeetingTypeSchema } from "@link/core";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/rows";

const NewPackSchema = z.object({
  title: z.string().trim().min(1, "Give the pack a title.").max(120),
  meetingType: MeetingTypeSchema,
  counterpart: z.string().trim().max(300),
  goal: z.string().trim().max(1000),
  language: z.string().trim().min(2).max(16),
});

export async function createPack(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = NewPackSchema.safeParse({
    title: formData.get("title") ?? "",
    meetingType: formData.get("meetingType") ?? "other",
    counterpart: formData.get("counterpart") ?? "",
    goal: formData.get("goal") ?? "",
    language: formData.get("language") ?? "en",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("packs")
    .insert({
      title: parsed.data.title,
      meeting_type: parsed.data.meetingType,
      counterpart: parsed.data.counterpart,
      goal: parsed.data.goal,
      language: parsed.data.language,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the pack." };

  redirect(`/packs/${data.id}`);
}

export async function deletePack(packId: string): Promise<void> {
  if (!z.uuid().safeParse(packId).success) return;
  const { supabase } = await requireUser();

  const { data: files } = await supabase
    .from("sources")
    .select("storage_path")
    .eq("pack_id", packId)
    .not("storage_path", "is", null);
  const paths = (files ?? []).map((f) => f.storage_path as string);
  if (paths.length > 0) await supabase.storage.from("sources").remove(paths);

  await supabase.from("packs").delete().eq("id", packId);
  revalidatePath("/packs");
  redirect("/packs");
}