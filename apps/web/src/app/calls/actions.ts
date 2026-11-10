"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

export async function deleteCall(callId: string): Promise<void> {
  if (!z.uuid().safeParse(callId).success) return;
  const { supabase } = await requireUser();
  // session_events are removed with the session (on delete cascade).
  await supabase.from("sessions").delete().eq("id", callId);
  revalidatePath("/calls");
  redirect("/calls");
}