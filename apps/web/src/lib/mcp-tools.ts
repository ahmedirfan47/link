import "server-only";
import { z } from "zod";
import { MeetingTypeSchema, sanitizeGeneratedCue } from "@link/core";
import { MAX_SOURCE_CHARS } from "@/lib/extract";
import { parseSummary } from "@/lib/rows";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tools the Claude / ChatGPT connector can call. They run with the admin
 * client, so EVERY query below filters by userId explicitly.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface ToolContext {
  admin: Admin;
  userId: string;
  origin: string;
}

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  run(args: unknown, ctx: ToolContext): Promise<unknown>;
}

const uuid = z.uuid();

async function ownPack(ctx: ToolContext, packId: string) {
  if (!uuid.safeParse(packId).success) throw new Error("pack_id must be a pack id from list_packs.");
  const { data } = await ctx.admin
    .from("packs")
    .select("id, title, meeting_type, counterpart, goal, language, status, updated_at")
    .eq("id", packId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new Error("Pack not found.");
  return data;
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_packs",
    title: "List packs",
    description:
      "List the user's Link packs (one per upcoming conversation) with how many cues each has. Call this first to find a pack_id.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    async run(_args, ctx) {
      const [{ data: packs }, { data: cues }] = await Promise.all([
        ctx.admin
          .from("packs")
          .select("id, title, meeting_type, counterpart, status, updated_at")
          .eq("user_id", ctx.userId)
          .neq("status", "archived")
          .order("updated_at", { ascending: false })
          .limit(100),
        ctx.admin.from("cues").select("pack_id, approved").eq("user_id", ctx.userId),
      ]);
      const counts = new Map<string, { approved: number; review: number }>();
      for (const c of cues ?? []) {
        const e = counts.get(c.pack_id as string) ?? { approved: 0, review: 0 };
        if (c.approved) e.approved += 1;
        else e.review += 1;
        counts.set(c.pack_id as string, e);
      }
      return (packs ?? []).map((p) => ({
        pack_id: p.id,
        title: p.title,
        meeting_type: p.meeting_type,
        counterpart: p.counterpart,
        cues_approved: counts.get(p.id as string)?.approved ?? 0,
        cues_to_review: counts.get(p.id as string)?.review ?? 0,
        url: `${ctx.origin}/packs/${p.id}`,
      }));
    },
  },
  {
    name: "get_pack",
    title: "Read a pack",
    description:
      "Read one pack: its goal, every cue (question, answer bullets, approved or not), its sources and the open questions only the user can answer.",
    inputSchema: {
      type: "object",
      properties: { pack_id: { type: "string", description: "Id from list_packs." } },
      required: ["pack_id"],
      additionalProperties: false,
    },
    readOnly: true,
    async run(args, ctx) {
      const { pack_id } = z.object({ pack_id: z.string() }).parse(args);
      const pack = await ownPack(ctx, pack_id);
      const [{ data: cues }, { data: sources }, { data: gaps }] = await Promise.all([
        ctx.admin
          .from("cues")
          .select("id, direction, kind, prompt, bullets, priority, approved")
          .eq("pack_id", pack_id)
          .eq("user_id", ctx.userId)
          .order("priority"),
        ctx.admin.from("sources").select("title, kind, created_at").eq("pack_id", pack_id).eq("user_id", ctx.userId),
        ctx.admin
          .from("gap_questions")
          .select("question")
          .eq("pack_id", pack_id)
          .eq("user_id", ctx.userId)
          .eq("status", "open"),
      ]);
      return {
        ...pack,
        url: `${ctx.origin}/packs/${pack.id}`,
        cues: cues ?? [],
        sources: sources ?? [],
        open_questions: (gaps ?? []).map((g) => g.question),
      };
    },
  },
  {
    name: "create_pack",
    title: "Create a pack",
    description:
      "Create a new pack for an upcoming conversation. Add material with add_source afterwards; the user generates cues on the website.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name, e.g. 'Seed round, Northgate Capital'." },
        meeting_type: { type: "string", enum: MeetingTypeSchema.options },
        counterpart: { type: "string", description: "Who the user is speaking with, one line." },
        goal: { type: "string", description: "What the user wants from the conversation." },
        language: { type: "string", enum: ["en", "ur-en", "ar-en"], description: "Default en." },
      },
      required: ["title", "meeting_type"],
      additionalProperties: false,
    },
    readOnly: false,
    async run(args, ctx) {
      const input = z
        .object({
          title: z.string().trim().min(1).max(120),
          meeting_type: MeetingTypeSchema,
          counterpart: z.string().trim().max(300).default(""),
          goal: z.string().trim().max(1000).default(""),
          language: z.enum(["en", "ur-en", "ar-en"]).default("en"),
        })
        .parse(args);
      const { data, error } = await ctx.admin
        .from("packs")
        .insert({ user_id: ctx.userId, ...input })
        .select("id, title")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Could not create the pack.");
      return { pack_id: data.id, title: data.title, url: `${ctx.origin}/packs/${data.id}` };
    },
  },
  {
    name: "add_source",
    title: "Add material to a pack",
    description:
      "Add text to a pack as a source: notes, a summary of this chat, key numbers, a draft pitch, answers the user has prepared. Link reads sources when it writes cues.",
    inputSchema: {
      type: "object",
      properties: {
        pack_id: { type: "string" },
        title: { type: "string", description: "What this is, e.g. 'Prep chat with Claude: objections'." },
        text: { type: "string", description: "The content. Plain text or Markdown." },
      },
      required: ["pack_id", "title", "text"],
      additionalProperties: false,
    },
    readOnly: false,
    async run(args, ctx) {
      const input = z
        .object({ pack_id: z.string(), title: z.string().trim().min(1).max(300), text: z.string().trim().min(20) })
        .parse(args);
      await ownPack(ctx, input.pack_id);
      const { error } = await ctx.admin.from("sources").insert({
        user_id: ctx.userId,
        pack_id: input.pack_id,
        kind: "note",
        title: input.title,
        content_text: input.text.slice(0, MAX_SOURCE_CHARS),
        status: "ready",
      });
      if (error) throw new Error(error.message);
      return { added: true, chars: Math.min(input.text.length, MAX_SOURCE_CHARS), next: "Generate or regenerate cues on the website." };
    },
  },
  {
    name: "add_cue",
    title: "Add a cue",
    description:
      "Add one cue: a question the user may be asked (or a point they want to raise) with up to three short answer bullets they can glance at. It is saved as 'needs review' so the user approves it before live use.",
    inputSchema: {
      type: "object",
      properties: {
        pack_id: { type: "string" },
        prompt: { type: "string", description: "The question or topic, as the other person might say it." },
        bullets: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
          description: "Short glanceable lines, not full sentences. Put key numbers first.",
        },
        variants: { type: "array", items: { type: "string" }, description: "Other ways it may be phrased." },
        keywords: { type: "array", items: { type: "string" }, description: "Distinctive trigger words." },
        direction: { type: "string", enum: ["incoming", "outgoing"], description: "incoming = they ask. Default incoming." },
        kind: { type: "string", enum: ["question", "topic", "number", "checklist"] },
        priority: { type: "integer", minimum: 1, maximum: 3, description: "1 very likely, 3 possible." },
      },
      required: ["pack_id", "prompt", "bullets"],
      additionalProperties: false,
    },
    readOnly: false,
    async run(args, ctx) {
      const raw = z.object({ pack_id: z.string() }).passthrough().parse(args) as Record<string, unknown> & {
        pack_id: string;
      };
      await ownPack(ctx, raw.pack_id);
      const cue = sanitizeGeneratedCue({
        direction: raw.direction,
        kind: raw.kind,
        prompt: raw.prompt,
        bullets: raw.bullets,
        variants: raw.variants,
        keywords: raw.keywords,
        priority: raw.priority,
      } as Parameters<typeof sanitizeGeneratedCue>[0]);
      if (!cue) throw new Error("The cue needs a prompt.");
      const { data, error } = await ctx.admin
        .from("cues")
        .insert({ user_id: ctx.userId, pack_id: raw.pack_id, ...cue, approved: false })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Could not add the cue.");
      return { cue_id: data.id, approved: false, review_at: `${ctx.origin}/packs/${raw.pack_id}` };
    },
  },
  {
    name: "list_calls",
    title: "List recent calls",
    description: "List the user's recent live calls with their summaries and the questions they were not ready for.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 10." } },
      additionalProperties: false,
    },
    readOnly: true,
    async run(args, ctx) {
      const { limit } = z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(args ?? {});
      const { data: calls } = await ctx.admin
        .from("sessions")
        .select("id, title, pack_id, started_at, ended_at, summary")
        .eq("user_id", ctx.userId)
        .order("started_at", { ascending: false })
        .limit(limit);
      const ids = (calls ?? []).map((c) => c.id as string);
      const { data: events } = ids.length
        ? await ctx.admin
            .from("session_events")
            .select("session_id, payload")
            .eq("user_id", ctx.userId)
            .eq("type", "unmatched_question")
            .in("session_id", ids)
        : { data: [] };
      return (calls ?? []).map((c) => ({
        call_id: c.id,
        title: c.title,
        pack_id: c.pack_id,
        started_at: c.started_at,
        ended_at: c.ended_at,
        summary: parseSummary(c.summary as string | null),
        not_prepared: (events ?? [])
          .filter((e) => e.session_id === c.id)
          .map((e) => (e.payload as { question?: string }).question)
          .filter(Boolean),
        url: `${ctx.origin}/calls/${c.id}`,
      }));
    },
  },
];

export function toolList() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false },
  }));
}