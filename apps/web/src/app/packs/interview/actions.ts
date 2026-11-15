"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ExtractionError, MAX_SOURCE_CHARS, extractFileText } from "@/lib/extract";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/rows";

const Input = z.object({
  role: z.string().trim().min(2, "Name the role.").max(120),
  company: z.string().trim().max(120),
  interviewer: z.string().trim().max(300),
  language: z.enum(["en", "ur-en", "ar-en"]),
  jd: z.string().trim().min(80, "Paste the full job description (a few paragraphs)."),
  cvText: z.string().trim(),
});

/** CVs above this size are better pasted as text: server actions carry at most 2 MB. */
const MAX_CV_BYTES = 1_500_000;

/** Creates an interview pack from a job description and a CV, ready to generate. */
export async function createInterviewPack(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = Input.safeParse({
    role: formData.get("role") ?? "",
    company: formData.get("company") ?? "",
    interviewer: formData.get("interviewer") ?? "",
    language: formData.get("language") ?? "en",
    jd: formData.get("jd") ?? "",
    cvText: formData.get("cvText") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  let cv = input.cvText;
  const file = formData.get("cvFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CV_BYTES) return { error: "That CV file is too large. Paste the text instead." };
    try {
      cv = await extractFileText(file);
    } catch (err) {
      return { error: err instanceof ExtractionError ? err.message : "Could not read the CV file." };
    }
  }
  if (cv.length < 200) return { error: "Add your CV: upload a PDF or Word file, or paste the text." };

  const { supabase } = await requireUser();
  const title = `${input.role}${input.company ? ` at ${input.company}` : ""}`.slice(0, 120);
  const { data: pack, error } = await supabase
    .from("packs")
    .insert({
      title: `Interview: ${title}`.slice(0, 120),
      meeting_type: "interview",
      counterpart: input.interviewer || (input.company ? `Interviewer at ${input.company}` : "Interviewer"),
      goal: `Get an offer for the ${input.role} role`.slice(0, 1000),
      language: input.language,
    })
    .select("id")
    .single();
  if (error || !pack) return { error: error?.message ?? "Could not create the pack." };

  const { error: srcError } = await supabase.from("sources").insert([
    {
      pack_id: pack.id,
      kind: "note",
      title: "Job description",
      content_text: input.jd.slice(0, MAX_SOURCE_CHARS),
      status: "ready",
    },
    { pack_id: pack.id, kind: "note", title: "My CV", content_text: cv.slice(0, MAX_SOURCE_CHARS), status: "ready" },
  ]);
  if (srcError) return { error: srcError.message };

  revalidatePath("/packs");
  redirect(`/packs/${pack.id}`);
}
