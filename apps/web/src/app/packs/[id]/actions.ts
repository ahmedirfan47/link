"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CueDirectionSchema, CueKindSchema, sanitizeGeneratedCue } from "@link/core";
import { cueFromGapAnswer, generatePack } from "@/lib/ai";
import {
  ExtractionError,
  MAX_SOURCE_CHARS,
  ShareBlockedError,
  classifyUrl,
  extractFileText,
  extractUrlText,
  readShareLink,
} from "@/lib/extract";
import { DESKTOP_SCHEME } from "@/lib/releases";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState, PackRow } from "@/lib/rows";
import { consume } from "@/lib/usage";

const Uuid = z.uuid();

function errorMessage(err: unknown): string {
  if (err instanceof ExtractionError) return err.message;
  if (err instanceof Error && err.name === "ChatExportError") return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

/** Loads the pack as the signed-in user; RLS returns nothing for other users' packs. */
async function loadPack(packId: string) {
  if (!Uuid.safeParse(packId).success) throw new Error("Invalid pack.");
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from("packs").select("*").eq("id", packId).single();
  if (error || !data) throw new Error("Pack not found.");
  return { supabase, userId, pack: data as PackRow };
}

function refresh(packId: string) {
  revalidatePath(`/packs/${packId}`);
}

/* ------------------------------------------------------------------ */
/*  Sources                                                            */
/* ------------------------------------------------------------------ */

export async function addNote(packId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const title = String(formData.get("title") ?? "").trim().slice(0, 300);
    const text = String(formData.get("text") ?? "").trim();
    if (text.length < 20) return { error: "Write at least a few sentences." };
    const { supabase } = await loadPack(packId);
    const { error } = await supabase.from("sources").insert({
      pack_id: packId,
      kind: "note",
      title: title || "Note",
      content_text: text.slice(0, MAX_SOURCE_CHARS),
      status: "ready",
    });
    if (error) return { error: error.message };
    refresh(packId);
    return { message: "Note added." };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function addLink(packId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { url, kind } = classifyUrl(String(formData.get("url") ?? ""));
    const { supabase, userId } = await loadPack(packId);
    await consume(userId, "link_imports");

    if (kind === "chatgpt_share" || kind === "claude_share") {
      try {
        const chat = await readShareLink(url, kind);
        const { error } = await supabase.from("sources").insert({
          pack_id: packId,
          kind,
          title: chat.title,
          uri: url.toString(),
          content_text: chat.text,
          messages: chat.messages,
          status: "ready",
        });
        if (error) return { error: error.message };
        refresh(packId);
        return { message: `Imported ${chat.messages.length} messages from “${chat.title.slice(0, 80)}”.` };
      } catch (err) {
        if (err instanceof ShareBlockedError) {
          const desktopUrl = `${DESKTOP_SCHEME}://read-share?pack=${packId}&url=${encodeURIComponent(url.toString())}`;
          return { error: err.message, desktopUrl };
        }
        throw err;
      }
    }

    const { title, text } = await extractUrlText(url);
    const { error } = await supabase.from("sources").insert({
      pack_id: packId,
      kind,
      title: title.slice(0, 300),
      uri: url.toString(),
      content_text: text,
      status: "ready",
    });
    if (error) return { error: error.message };
    refresh(packId);
    return { message: `Imported “${title.slice(0, 80)}”.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/**
 * The browser uploads the file straight to Storage (so big files skip the
 * serverless request limit), then calls this to read the text out of it.
 */
export async function addUploadedFile(
  packId: string,
  storagePath: string,
  fileName: string,
  contentType: string,
): Promise<ActionState> {
  const { supabase, userId } = await loadPack(packId);
  const ownPrefix = `${userId}/${packId}/`;
  if (!storagePath.startsWith(ownPrefix) || storagePath.includes("..")) {
    return { error: "Upload path is not valid." };
  }
  try {
    const download = await supabase.storage.from("sources").download(storagePath);
    if (download.error || !download.data) {
      return { error: `Could not read the uploaded file: ${download.error?.message ?? "not found"}` };
    }
    const name = fileName.slice(0, 300) || "file";
    const file = new File([download.data], name, { type: contentType || download.data.type });
    const text = await extractFileText(file);

    const { error } = await supabase.from("sources").insert({
      pack_id: packId,
      kind: "file",
      title: name,
      storage_path: storagePath,
      content_text: text,
      status: "ready",
    });
    if (error) throw new Error(error.message);
    refresh(packId);
    return { message: `Added ${name}.` };
  } catch (err) {
    await supabase.storage.from("sources").remove([storagePath]);
    return { error: errorMessage(err) };
  }
}

export async function deleteSource(packId: string, sourceId: string): Promise<void> {
  if (!Uuid.safeParse(sourceId).success) return;
  const { supabase } = await loadPack(packId);
  const { data } = await supabase.from("sources").select("storage_path").eq("id", sourceId).single();
  if (data?.storage_path) await supabase.storage.from("sources").remove([data.storage_path]);
  await supabase.from("sources").delete().eq("id", sourceId);
  refresh(packId);
}

/* ------------------------------------------------------------------ */
/*  Generation                                                         */
/* ------------------------------------------------------------------ */

export async function generateCues(packId: string, _prev: ActionState): Promise<ActionState> {
  let supabaseRef: Awaited<ReturnType<typeof loadPack>>["supabase"] | null = null;
  try {
    const { supabase, pack, userId } = await loadPack(packId);
    supabaseRef = supabase;

    const { data: sources } = await supabase
      .from("sources")
      .select("title, kind, content_text")
      .eq("pack_id", packId)
      .eq("status", "ready")
      .order("created_at", { ascending: true });
    const usable = (sources ?? [])
      .filter((s) => (s.content_text ?? "").trim().length > 0)
      .map((s) => ({ title: s.title as string, kind: s.kind as string, text: s.content_text as string }));
    if (usable.length === 0) return { error: "Add at least one source first." };
    await consume(userId, "pack_generations");

    await supabase.from("packs").update({ status: "generating" }).eq("id", packId);
    const generated = await generatePack(pack, usable);

    // Keep cues the user already approved; replace the rest.
    const { data: approved } = await supabase
      .from("cues")
      .select("direction, prompt")
      .eq("pack_id", packId)
      .eq("approved", true);
    const keep = new Set((approved ?? []).map((c) => `${c.direction}:${String(c.prompt).toLowerCase()}`));

    await supabase.from("cues").delete().eq("pack_id", packId).eq("approved", false);
    const rows = generated.cues
      .filter((c) => !keep.has(`${c.direction}:${c.prompt.toLowerCase()}`))
      .map((c) => ({ pack_id: packId, ...c, approved: false }));
    if (rows.length > 0) {
      const { error } = await supabase.from("cues").insert(rows);
      if (error) throw new Error(error.message);
    }

    await supabase.from("gap_questions").delete().eq("pack_id", packId).eq("status", "open");
    if (generated.gaps.length > 0) {
      await supabase
        .from("gap_questions")
        .insert(generated.gaps.map((question) => ({ pack_id: packId, question })));
    }

    await supabase.from("packs").update({ status: "ready" }).eq("id", packId);
    refresh(packId);
    return {
      message: `Generated ${rows.length} cues and ${generated.gaps.length} questions for you to answer.`,
    };
  } catch (err) {
    if (supabaseRef) await supabaseRef.from("packs").update({ status: "draft" }).eq("id", packId);
    refresh(packId);
    return { error: errorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/*  Gap questions                                                      */
/* ------------------------------------------------------------------ */

export async function answerGap(
  packId: string,
  gapId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    if (!Uuid.safeParse(gapId).success) return { error: "Invalid question." };
    const answer = String(formData.get("answer") ?? "").trim().slice(0, 2000);
    if (answer.length < 2) return { error: "Write an answer first." };

    const { supabase, pack, userId } = await loadPack(packId);
    const { data: gap } = await supabase.from("gap_questions").select("question").eq("id", gapId).single();
    if (!gap) return { error: "Question not found." };
    await consume(userId, "answer_cues");

    const cue = await cueFromGapAnswer(pack, gap.question as string, answer);
    const { error } = await supabase.from("cues").insert({ pack_id: packId, ...cue, approved: true });
    if (error) return { error: error.message };
    await supabase.from("gap_questions").update({ answer, status: "answered" }).eq("id", gapId);
    refresh(packId);
    return { message: "Saved as a cue." };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function skipGap(packId: string, gapId: string): Promise<void> {
  if (!Uuid.safeParse(gapId).success) return;
  const { supabase } = await loadPack(packId);
  await supabase.from("gap_questions").update({ status: "skipped" }).eq("id", gapId);
  refresh(packId);
}

/* ------------------------------------------------------------------ */
/*  Cues                                                               */
/* ------------------------------------------------------------------ */

const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export async function saveCue(
  packId: string,
  cueId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const direction = CueDirectionSchema.safeParse(formData.get("direction"));
    const kind = CueKindSchema.safeParse(formData.get("kind"));
    const cue = sanitizeGeneratedCue({
      direction: direction.success ? direction.data : "incoming",
      kind: kind.success ? kind.data : "question",
      prompt: String(formData.get("prompt") ?? ""),
      variants: lines(formData.get("variants")),
      bullets: lines(formData.get("bullets")),
      keywords: String(formData.get("keywords") ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      priority: Number(formData.get("priority") ?? 2),
    });
    if (!cue) return { error: "The cue needs a prompt." };
    const approved = formData.get("approved") === "on";

    const { supabase } = await loadPack(packId);
    if (cueId) {
      if (!Uuid.safeParse(cueId).success) return { error: "Invalid cue." };
      const { error } = await supabase.from("cues").update({ ...cue, approved }).eq("id", cueId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("cues").insert({ pack_id: packId, ...cue, approved });
      if (error) return { error: error.message };
    }
    refresh(packId);
    return { message: "Saved." };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function deleteCue(packId: string, cueId: string): Promise<void> {
  if (!Uuid.safeParse(cueId).success) return;
  const { supabase } = await loadPack(packId);
  await supabase.from("cues").delete().eq("id", cueId);
  refresh(packId);
}

export async function approveAll(packId: string): Promise<void> {
  const { supabase } = await loadPack(packId);
  await supabase.from("cues").update({ approved: true }).eq("pack_id", packId).eq("approved", false);
  refresh(packId);
}

export async function setCueApproved(packId: string, cueId: string, approved: boolean): Promise<void> {
  if (!Uuid.safeParse(cueId).success) return;
  const { supabase } = await loadPack(packId);
  await supabase.from("cues").update({ approved }).eq("id", cueId);
  refresh(packId);
}

/* ------------------------------------------------------------------ */
/*  ChatGPT / Claude data export                                       */
/* ------------------------------------------------------------------ */

export interface ExportListing {
  error?: string;
  chats?: { id: string; title: string; updatedAt: string; source: "chatgpt" | "claude"; messages: number }[];
}

async function readExport(packId: string, storagePath: string) {
  const loaded = await loadPack(packId);
  if (!storagePath.startsWith(`${loaded.userId}/${packId}/import-`) || storagePath.includes("..")) {
    throw new Error("Upload path is not valid.");
  }
  const download = await loaded.supabase.storage.from("sources").download(storagePath);
  if (download.error || !download.data) throw new Error("The uploaded export could not be read. Upload it again.");
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const { parseChatExport } = await import("@/lib/chat-export");
  return { ...loaded, chats: parseChatExport(bytes, storagePath) };
}

/** Lists the chats inside an uploaded export so the user can pick the relevant ones. */
export async function scanChatExport(packId: string, storagePath: string): Promise<ExportListing> {
  try {
    const { chats } = await readExport(packId, storagePath);
    return {
      chats: chats.slice(0, 3000).map((c) => ({
        id: c.id,
        title: c.title.slice(0, 200),
        updatedAt: c.updatedAt,
        source: c.source,
        messages: c.messages.length,
      })),
    };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const MAX_CHATS_PER_IMPORT = 10;

/** Adds the chosen chats as sources, then deletes the uploaded export. */
export async function importChats(packId: string, storagePath: string, chatIds: string[]): Promise<ActionState> {
  try {
    const ids = [...new Set(chatIds)].slice(0, MAX_CHATS_PER_IMPORT);
    if (ids.length === 0) return { error: "Pick at least one chat." };
    const { supabase, userId, chats } = await readExport(packId, storagePath);
    await consume(userId, "chat_imports");

    const { chatToText } = await import("@/lib/chat-export");
    const { MAX_SHARE_MESSAGES } = await import("@link/core");
    const chosen = chats.filter((c) => ids.includes(c.id));
    if (chosen.length === 0) return { error: "Those chats were not found in the export." };

    const { error } = await supabase.from("sources").insert(
      chosen.map((c) => ({
        pack_id: packId,
        kind: "chat_export",
        title: `${c.source === "chatgpt" ? "ChatGPT" : "Claude"}: ${c.title}`.slice(0, 300),
        content_text: chatToText(c).slice(0, MAX_SOURCE_CHARS),
        messages: c.messages.slice(0, MAX_SHARE_MESSAGES),
        status: "ready",
      })),
    );
    if (error) return { error: error.message };

    await supabase.storage.from("sources").remove([storagePath]);
    refresh(packId);
    return { message: `Added ${chosen.length} chat${chosen.length === 1 ? "" : "s"}.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/** Deletes an uploaded export without importing anything. */
export async function discardChatExport(packId: string, storagePath: string): Promise<void> {
  const { supabase, userId } = await loadPack(packId);
  if (!storagePath.startsWith(`${userId}/${packId}/import-`)) return;
  await supabase.storage.from("sources").remove([storagePath]);
}