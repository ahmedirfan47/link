import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export const MeetingTypeSchema = z.enum([
  "investor",
  "sales",
  "client",
  "partner",
  "interview",
  "presentation",
  "viva",
  "negotiation",
  "other",
]);
export type MeetingType = z.infer<typeof MeetingTypeSchema>;

export const PackStatusSchema = z.enum(["draft", "generating", "ready", "archived"]);
export type PackStatus = z.infer<typeof PackStatusSchema>;

export const SourceKindSchema = z.enum([
  "file",
  "url",
  "chatgpt_share",
  "claude_share",
  "chat_export",
  "note",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceStatusSchema = z.enum(["pending", "processing", "ready", "failed"]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

/** incoming = they say it to you; outgoing = you want to say or ask it. */
export const CueDirectionSchema = z.enum(["incoming", "outgoing"]);
export type CueDirection = z.infer<typeof CueDirectionSchema>;

/**
 * question  = a question they may ask you (incoming) or you want to ask (outgoing)
 * topic     = a subject that should surface a card when mentioned
 * number    = a key figure you must not blank on (price, MRR, market size)
 * checklist = a point you want to make before the call ends (outgoing)
 */
export const CueKindSchema = z.enum(["question", "topic", "number", "checklist"]);
export type CueKind = z.infer<typeof CueKindSchema>;

export const GapStatusSchema = z.enum(["open", "answered", "skipped"]);
export type GapStatus = z.infer<typeof GapStatusSchema>;

export const SessionEventTypeSchema = z.enum([
  "cue_shown",
  "cue_dismissed",
  "checklist_done",
  "unmatched_question",
  "fallback_cue",
  "hesitation",
]);
export type SessionEventType = z.infer<typeof SessionEventTypeSchema>;

/* ------------------------------------------------------------------ */
/*  Limits shared by the generator, the database and the overlay       */
/* ------------------------------------------------------------------ */

export const LIMITS = {
  promptMaxChars: 300,
  variantMaxChars: 300,
  variantsPerCue: 12,
  bulletMaxChars: 120,
  bulletsPerCue: 3,
  keywordsPerCue: 10,
  cuesPerPack: 200,
} as const;

/* ------------------------------------------------------------------ */
/*  Entities (camelCase in app code; snake_case in Postgres)           */
/* ------------------------------------------------------------------ */

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });

export const PackSchema = z.object({
  id,
  userId: id,
  title: z.string().min(1).max(120),
  meetingType: MeetingTypeSchema,
  counterpart: z.string().max(300).default(""),
  goal: z.string().max(1000).default(""),
  language: z.string().min(2).max(16).default("en"),
  status: PackStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Pack = z.infer<typeof PackSchema>;

export const SourceSchema = z.object({
  id,
  packId: id,
  userId: id,
  kind: SourceKindSchema,
  title: z.string().max(300),
  uri: z.string().max(2000).nullable(),
  contentText: z.string().nullable(),
  status: SourceStatusSchema,
  error: z.string().nullable(),
  createdAt: timestamp,
});
export type Source = z.infer<typeof SourceSchema>;

export const CueSchema = z.object({
  id,
  packId: id,
  userId: id,
  direction: CueDirectionSchema,
  kind: CueKindSchema,
  prompt: z.string().min(1).max(LIMITS.promptMaxChars),
  variants: z.array(z.string().min(1).max(LIMITS.variantMaxChars)).max(LIMITS.variantsPerCue),
  bullets: z.array(z.string().min(1).max(LIMITS.bulletMaxChars)).max(LIMITS.bulletsPerCue),
  keywords: z.array(z.string().min(1).max(60)).max(LIMITS.keywordsPerCue),
  priority: z.number().int().min(1).max(3),
  approved: z.boolean(),
  sourceIds: z.array(id),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Cue = z.infer<typeof CueSchema>;

export const GapQuestionSchema = z.object({
  id,
  packId: id,
  userId: id,
  question: z.string().min(1).max(500),
  answer: z.string().max(2000).nullable(),
  status: GapStatusSchema,
  createdAt: timestamp,
});
export type GapQuestion = z.infer<typeof GapQuestionSchema>;

export const SessionSchema = z.object({
  id,
  userId: id,
  packId: id.nullable(),
  title: z.string().max(200),
  startedAt: timestamp,
  endedAt: timestamp.nullable(),
  summary: z.string().nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionEventSchema = z.object({
  id,
  sessionId: id,
  userId: id,
  tMs: z.number().int().nonnegative(),
  type: SessionEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;

/* ------------------------------------------------------------------ */
/*  What the pack generator (Claude) must return                       */
/* ------------------------------------------------------------------ */

export const GeneratedCueSchema = CueSchema.pick({
  direction: true,
  kind: true,
  prompt: true,
  variants: true,
  bullets: true,
  keywords: true,
  priority: true,
});
export type GeneratedCue = z.infer<typeof GeneratedCueSchema>;

export const GeneratedPackSchema = z.object({
  cues: z.array(GeneratedCueSchema).max(LIMITS.cuesPerPack),
  gaps: z.array(z.string().min(1).max(500)).max(30),
});
export type GeneratedPack = z.infer<typeof GeneratedPackSchema>;