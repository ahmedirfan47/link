import "server-only";
import { z } from "zod";
import {
  CueDirectionSchema,
  CueKindSchema,
  sanitizeGeneratedCue,
  sanitizeGeneratedPack,
  type GeneratedCue,
  type GeneratedPack,
} from "@link/core";
import { liveModel, packModel, xaiApiKey } from "@/lib/env";
import { MEETING_TYPE_LABELS, type CueRow, type PackRow } from "@/lib/rows";

/* ------------------------------------------------------------------ */
/*  Grok (xAI) client. OpenAI-compatible Chat Completions over fetch.  */
/* ------------------------------------------------------------------ */

const XAI_URL = "https://api.x.ai/v1/chat/completions";

/** How long Grok thinks before answering. Reasoning cannot be switched off. */
type Effort = "low" | "medium" | "high";

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export class AiError extends Error {
  override name = "AiError";
}

/** JSON Schema for xAI structured outputs: no $schema key, no huge integer bounds. */
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (typeof node !== "object" || node === null) return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$schema") continue;
      if ((key === "minimum" || key === "maximum") && typeof value === "number" && Math.abs(value) > 1e9) continue;
      out[key] = clean(value);
    }
    return out;
  };
  return clean(z.toJSONSchema(schema, { target: "draft-7", io: "output" })) as Record<string, unknown>;
}

async function xaiRequest(body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  const res = await fetch(XAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${xaiApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`xAI ${res.status}: ${detail.slice(0, 500)}`);
    if (res.status === 401 || res.status === 403) throw new AiError("The AI key is missing or invalid. Check XAI_API_KEY.");
    if (res.status === 429) throw new AiError("The AI service is busy. Try again in a minute.");
    throw new AiError(`The AI service returned an error (${res.status}). Try again.`);
  }
  return res;
}

/** Asks Grok for JSON matching a schema and parses it. */
async function grokJson<S extends z.ZodType>(opts: {
  schema: S;
  name: string;
  system: string;
  user: string;
  model: string;
  effort: Effort;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<z.infer<S>> {
  const res = await xaiRequest(
    {
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ] satisfies ChatTurn[],
      reasoning_effort: opts.effort,
      max_completion_tokens: opts.maxTokens,
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.name, schema: jsonSchemaFor(opts.schema), strict: true },
      },
    },
    opts.timeoutMs ?? 120_000,
  );
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new AiError("The answer was too long to finish. Remove some material and try again.");
  }
  const content = choice?.message?.content;
  if (!content) throw new AiError(choice?.message?.refusal || "The AI returned no answer. Try again.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiError("The AI returned an unreadable answer. Try again.");
  }
  const result = opts.schema.safeParse(parsed);
  if (!result.success) throw new AiError("The AI answer was incomplete. Try again.");
  return result.data;
}

/* ------------------------------------------------------------------ */
/*  Output shapes the model must follow.                               */
/*  Deliberately lenient: limits are enforced by sanitize in @link/core */
/*  so one long bullet never fails a whole generation.                 */
/* ------------------------------------------------------------------ */

const ModelCueSchema = z.object({
  direction: CueDirectionSchema,
  kind: CueKindSchema,
  prompt: z.string(),
  variants: z.array(z.string()),
  bullets: z.array(z.string()),
  keywords: z.array(z.string()),
  priority: z.number().int(),
});

const ModelPackSchema = z.object({
  cues: z.array(ModelCueSchema),
  gaps: z.array(z.string()),
});

const GradeSchema = z.object({
  score: z.number().int(),
  covered: z.array(z.string()),
  missed: z.array(z.string()),
  tip: z.string(),
});
export type Grade = z.infer<typeof GradeSchema>;

/** Total source text sent to the pack model (about 50k tokens). */
const MAX_PROMPT_SOURCE_CHARS = 200_000;

function packContext(pack: PackRow): string {
  return [
    `Meeting type: ${MEETING_TYPE_LABELS[pack.meeting_type]}`,
    `Title: ${pack.title}`,
    pack.counterpart ? `Who I am speaking with: ${pack.counterpart}` : null,
    pack.goal ? `My goal for this conversation: ${pack.goal}` : null,
    `Language of the conversation: ${pack.language}`,
  ]
    .filter(Boolean)
    .join("\n");
}

type SourceText = { title: string; kind: string; text: string };

function sourceBlocks(sources: SourceText[], maxChars: number): string {
  let budget = maxChars;
  const blocks: string[] = [];
  for (const [i, s] of sources.entries()) {
    if (budget <= 0) break;
    const text = s.text.slice(0, budget);
    budget -= text.length;
    blocks.push(`<source index="${i + 1}" kind="${s.kind}" title="${s.title.replace(/"/g, "'")}">\n${text}\n</source>`);
  }
  return blocks.join("\n\n");
}

const PACK_SYSTEM = `You are the preparation engine of Link, a tool that shows a person short cue cards on screen during a live conversation (investor pitch, sales call, interview, viva, negotiation and so on).

From the user's source material and meeting details, build a cue pack.

INCOMING cues (things the other side will say or ask):
- 30 to 70 "question" cues: the questions this counterpart is most likely to ask, given the meeting type and material. Include the hard and awkward ones.
- For each, 4 to 8 "variants": other ways a real person would phrase it out loud, including short, informal and partial phrasings ("and revenue?", "how are you making money right now"). Variants are matched against live speech, so make them sound spoken, not written.
- 5 to 15 "topic" cues: subjects that should surface a card when merely mentioned (competition, pricing, team, timeline). Prompt is the topic; variants are phrases that signal it.
- "number" cues for every key figure in the material (price, revenue, users, market size, dates, terms). Prompt names the figure; the bullet holds the exact value from the sources; keywords hold words that would trigger it.

OUTGOING cues (things the user wants to say or ask):
- 5 to 12 "question" cues the user should ask the counterpart.
- 3 to 8 "checklist" cues: points the user must make before the call ends.

BULLETS (the answer cue the user glances at mid-sentence):
- At most 3 bullets, each under 12 words. Fragments, not sentences. Lead with the fact or number.
- Written from the user's point of view.
- Use ONLY facts from the sources. Never invent numbers, names, customers or claims. If the sources do not contain the answer, give the approach in bullets (for example "Acknowledge early stage; pivot to pilot results") and add a gap question instead.

KEYWORDS: up to 6 exact words or short phrases that should trigger the cue on their own (product names, competitor names, figures). Leave empty when none fit.

PRIORITY: 1 = very likely or critical, 2 = likely, 3 = possible.

GAPS: up to 20 short, specific questions to ask the user, for facts the sources do not cover but the counterpart is likely to probe (for example "What is your current monthly revenue?").

Return JSON only.`;

/** Builds the full cue pack for a pack from its source texts. */
export async function generatePack(pack: PackRow, sources: SourceText[]): Promise<GeneratedPack> {
  const out = await grokJson({
    schema: ModelPackSchema,
    name: "cue_pack",
    system: PACK_SYSTEM,
    user: `MEETING\n${packContext(pack)}\n\nSOURCES\n${sourceBlocks(sources, MAX_PROMPT_SOURCE_CHARS)}\n\nBuild the cue pack now.`,
    model: packModel(),
    effort: "medium",
    maxTokens: 64_000,
    timeoutMs: 280_000,
  });
  return sanitizeGeneratedPack(out);
}

/** Turns the user's answer to a gap question into an approved incoming cue. */
export async function cueFromGapAnswer(pack: PackRow, question: string, answer: string): Promise<GeneratedCue> {
  const out = await grokJson({
    schema: ModelCueSchema,
    name: "cue",
    system:
      "You turn a person's answer into one Link cue card. direction=incoming, kind=question. prompt = the question. variants = 4-8 spoken ways the other side might ask it. bullets = at most 3 fragments under 12 words, using only facts in the answer. keywords = exact trigger words (names, figures), may be empty. priority 1-3. Return JSON only.",
    user: `MEETING\n${packContext(pack)}\n\nQUESTION\n${question}\n\nMY ANSWER\n${answer}`,
    model: liveModel(),
    effort: "low",
    maxTokens: 4_000,
  });
  const cue = sanitizeGeneratedCue(out);
  if (!cue) throw new AiError("Could not turn that answer into a cue. Try rephrasing it.");
  return { ...cue, direction: "incoming", kind: "question", prompt: cue.prompt || question };
}

/** Grades a rehearsal answer against the cue's bullets. */
export async function gradeAnswer(
  pack: PackRow,
  cue: Pick<CueRow, "prompt" | "bullets">,
  answer: string,
): Promise<Grade> {
  const grade = await grokJson({
    schema: GradeSchema,
    name: "grade",
    system:
      "You are a concise speaking coach. Compare the user's spoken answer with their prepared key points. score: 0-100 for how well the answer covers the key points clearly and confidently. covered: key points they made. missed: key points they left out. tip: one sentence on how to say it better next time. Be direct and specific. Return JSON only.",
    user: `MEETING\n${packContext(pack)}\n\nQUESTION\n${cue.prompt}\n\nPREPARED KEY POINTS\n${cue.bullets.map((b) => `- ${b}`).join("\n") || "(none)"}\n\nMY ANSWER\n${answer}`,
    model: liveModel(),
    effort: "low",
    maxTokens: 3_000,
  });
  return { ...grade, score: Math.max(0, Math.min(100, grade.score)) };
}

/* ------------------------------------------------------------------ */
/*  Live: unprepared questions and after-call summaries                */
/* ------------------------------------------------------------------ */

const FallbackSchema = z.object({
  bullets: z.array(z.string()),
  confident: z.boolean(),
});
export type FallbackCue = { bullets: string[]; confident: boolean };

/** Max characters of prepared cues sent as knowledge for an unprepared question. */
const MAX_KNOWLEDGE_CHARS = 60_000;

/**
 * Writes an emergency cue for a question the pack did not prepare for,
 * using only facts from the user's own cues. Kept small and fast.
 */
export async function fallbackCue(
  pack: PackRow,
  knowledge: Pick<CueRow, "prompt" | "bullets">[],
  question: string,
): Promise<FallbackCue> {
  let budget = MAX_KNOWLEDGE_CHARS;
  const lines: string[] = [];
  for (const k of knowledge) {
    const line = `Q: ${k.prompt}\nA: ${k.bullets.join("; ")}`;
    if (line.length > budget) break;
    budget -= line.length;
    lines.push(line);
  }

  const out = await grokJson({
    schema: FallbackSchema,
    name: "fallback_cue",
    system:
      "You help a person answer an unexpected question during a live conversation. Return at most 3 bullet fragments, each under 10 words, that they can glance at and say. Use only facts from their prepared notes; if the notes do not cover it, give a short honest approach instead (for example 'Not tracked yet; will share by Friday'). confident=true only if the notes directly answer the question. Return JSON only.",
    user: `MEETING\n${packContext(pack)}\n\nMY PREPARED NOTES\n${lines.join("\n\n") || "(none)"}\n\nTHEY JUST ASKED\n${question}`,
    model: liveModel(),
    effort: "low",
    maxTokens: 2_000,
    timeoutMs: 30_000,
  });
  return {
    bullets: out.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 3).map((b) => b.slice(0, 120)),
    confident: out.confident,
  };
}

const SummarySchema = z.object({
  summary: z.string(),
  followUps: z.array(z.string()),
  practice: z.array(z.string()),
});
export type SessionSummary = z.infer<typeof SummarySchema>;

/** Max characters of transcript sent for the after-call summary. */
const MAX_TRANSCRIPT_CHARS = 150_000;

/** Summarises a finished call. The transcript is used once and not stored. */
export async function summarizeSession(
  pack: PackRow | null,
  transcript: { speaker: "them" | "you"; text: string }[],
  hesitations: string[],
): Promise<SessionSummary> {
  let text = transcript.map((t) => `${t.speaker === "you" ? "ME" : "THEM"}: ${t.text}`).join("\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) text = text.slice(-MAX_TRANSCRIPT_CHARS);

  return grokJson({
    schema: SummarySchema,
    name: "call_summary",
    system:
      "You review a finished conversation for the person labelled ME. summary: 4-6 sentences on what happened and where it landed. followUps: concrete next actions ME promised or should take. practice: up to 5 specific moments ME struggled with (hesitations, weak or vague answers) phrased as questions to rehearse. Be direct. Return JSON only.",
    user: `${pack ? `MEETING\n${packContext(pack)}\n\n` : ""}MOMENTS I HESITATED\n${hesitations.join("\n") || "(none)"}\n\nTRANSCRIPT\n${text}`,
    model: liveModel(),
    effort: "low",
    maxTokens: 6_000,
  });
}

/* ------------------------------------------------------------------ */
/*  Ask: questions about the pack's chats and other sources            */
/* ------------------------------------------------------------------ */

/** Source text sent with each question (about 40k tokens). */
const MAX_ASK_SOURCE_CHARS = 160_000;
/** Earlier turns of the Ask conversation sent for context. */
const MAX_ASK_HISTORY = 12;

const ASK_SYSTEM = `You are Link's research assistant. The user is preparing for a conversation and has collected sources: shared ChatGPT or Claude chats, documents, links and notes.

Answer the user's question using these sources. Rules:
- Ground every claim in the sources. When it helps, name the source in brackets, for example [Pricing chat].
- If the sources do not contain the answer, say so plainly, then give your best general guidance and label it as such.
- Be concise and direct. Use short paragraphs or bullets. No preamble.`;

/**
 * Streams Grok's answer as plain text chunks. The caller saves the full answer.
 */
export async function* askStream(
  pack: PackRow,
  sources: SourceText[],
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
): AsyncGenerator<string> {
  const messages: ChatTurn[] = [
    {
      role: "system",
      content: `${ASK_SYSTEM}\n\nMEETING\n${packContext(pack)}\n\nSOURCES\n${sourceBlocks(sources, MAX_ASK_SOURCE_CHARS) || "(no sources yet)"}`,
    },
    ...history.slice(-MAX_ASK_HISTORY),
    { role: "user", content: question },
  ];

  const res = await xaiRequest(
    {
      model: liveModel(),
      messages,
      reasoning_effort: "low",
      max_completion_tokens: 8_000,
      stream: true,
    },
    120_000,
  );
  if (!res.body) throw new AiError("The AI returned no answer. Try again.");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] };
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        /* keep-alive or partial line */
      }
    }
  }
}