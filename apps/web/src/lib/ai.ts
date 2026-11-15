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

/**
 * How to write cards for a mixed-language call. Live speech arrives as Urdu or
 * Arabic script, romanised text, or English, often switching mid-sentence, so
 * each card needs phrasings in all three for matching to work.
 */
export function languageRules(language: string): string {
  if (language.startsWith("ur")) {
    return `LANGUAGE: the call mixes Urdu and English (code-switching). For every card, "variants" must include English phrasings, Urdu in Urdu script (for example "آپ کی قیمت کیا ہے"), and Roman Urdu (for example "aap ki pricing kya hai"), plus mixed sentences ("aapka revenue kitna hai"). "keywords" may include the same term in both scripts. Write "prompt" in the language the question is most likely asked in and "bullets" in English unless the sources are mainly in Urdu.`;
  }
  if (language.startsWith("ar")) {
    return `LANGUAGE: the call mixes Arabic and English (code-switching), Gulf or Levantine dialect as well as Modern Standard Arabic. For every card, "variants" must include English phrasings, Arabic script in both formal and spoken dialect (for example "كم السعر" and "شو السعر"), and Arabizi where common (for example "kam el se3r"), plus mixed sentences. "keywords" may include the same term in both scripts. Write "prompt" in the language the question is most likely asked in and "bullets" in English unless the sources are mainly in Arabic.`;
  }
  return "";
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

/**
 * The same rules Grok follows, for an outside assistant (the user's own
 * Claude or ChatGPT through the connector) that writes the cards instead.
 */
export function cardWritingGuide(pack: PackRow): string {
  return [
    PACK_SYSTEM.replace("Return JSON only.", "").trim(),
    meetingRules(pack.meeting_type),
    languageRules(pack.language),
    `MEETING\n${packContext(pack)}`,
    "HOW TO SAVE: call save_cards with the cards (direction, kind, prompt, variants, bullets, keywords, priority). " +
      "Send them in batches of up to 40. Then call save_gaps with the open questions. The user reviews and approves them on the website.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Builds the full cue pack for a pack from its source texts. */
export async function generatePack(pack: PackRow, sources: SourceText[]): Promise<GeneratedPack> {
  const out = await grokJson({
    schema: ModelPackSchema,
    name: "cue_pack",
    system: PACK_SYSTEM,
    user: `MEETING\n${packContext(pack)}\n${meetingRules(pack.meeting_type)}\n${languageRules(pack.language)}\n\nSOURCES\n${sourceBlocks(sources, MAX_PROMPT_SOURCE_CHARS)}\n\nBuild the cue pack now.`,
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
    user: `MEETING\n${packContext(pack)}\n${languageRules(pack.language)}\n\nQUESTION\n${question}\n\nMY ANSWER\n${answer}`,
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

/* ------------------------------------------------------------------ */
/*  Pocket: an answer for a question no card covers                    */
/* ------------------------------------------------------------------ */

const PocketAnswerSchema = z.object({
  bullets: z.array(z.string()),
  confident: z.boolean(),
  sources: z.array(z.string()),
});
export type PocketAnswer = { bullets: string[]; confident: boolean; sources: string[] };

/** Sources sent with a Pocket question; small, so the answer comes back fast. */
const MAX_POCKET_SOURCE_CHARS = 60_000;

/**
 * Three glanceable points for a question the user did not prepare for,
 * built from the pack's sources and approved cards.
 */
export async function answerFromSources(
  pack: PackRow,
  sources: SourceText[],
  cards: Pick<CueRow, "prompt" | "bullets">[],
  question: string,
): Promise<PocketAnswer> {
  const notes = cards
    .slice(0, 150)
    .map((c) => `Q: ${c.prompt}\nA: ${c.bullets.join("; ")}`)
    .join("\n\n");
  const out = await grokJson({
    schema: PocketAnswerSchema,
    name: "pocket_answer",
    system:
      "A person is in a live conversation and was asked something they did not prepare for. Give at most 3 bullet fragments, each under 12 words, that they can glance at and say. Use only facts from their sources and prepared cards. If those do not answer it, give a short honest approach instead (for example 'Not tracked yet; offer to follow up by Friday'). confident=true only if the sources directly answer it. sources = titles of the sources you used. Return JSON only.",
    user: `MEETING\n${packContext(pack)}\n\nPREPARED CARDS\n${notes || "(none)"}\n\nSOURCES\n${sourceBlocks(sources, MAX_POCKET_SOURCE_CHARS) || "(none)"}\n\nTHEY JUST ASKED\n${question}`,
    model: liveModel(),
    effort: "low",
    maxTokens: 3_000,
    timeoutMs: 45_000,
  });
  return {
    bullets: out.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 3).map((b) => b.slice(0, 140)),
    confident: out.confident,
    sources: out.sources.map((s) => s.trim()).filter(Boolean).slice(0, 5),
  };
}

/* ------------------------------------------------------------------ */
/*  After a call: write cards for the questions you were not ready for */
/* ------------------------------------------------------------------ */

const DraftCardsSchema = z.object({ cues: z.array(ModelCueSchema) });

/**
 * Drafts one incoming question card per missed question, answered from the
 * pack's sources. Cards come back unapproved so the user reviews them.
 */
export async function draftCardsForQuestions(
  pack: PackRow,
  sources: SourceText[],
  questions: string[],
): Promise<GeneratedCue[]> {
  const out = await grokJson({
    schema: DraftCardsSchema,
    name: "missed_question_cards",
    system:
      "You write Link cue cards for questions a person was asked in a real conversation and was not ready for. One card per question, in the same order. direction=incoming, kind=question. prompt = the question, cleaned up. variants = 4-8 spoken ways someone might ask it. bullets = at most 3 fragments under 12 words, using only facts from the sources; if the sources do not answer it, give the approach (for example 'Share pilot results instead; send numbers after'). keywords = exact trigger words, may be empty. priority 1 (it was really asked). Return JSON only.",
    user: `MEETING\n${packContext(pack)}\n${languageRules(pack.language)}\n\nQUESTIONS THEY ASKED\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nSOURCES\n${sourceBlocks(sources, MAX_POCKET_SOURCE_CHARS * 2) || "(none)"}`,
    model: liveModel(),
    effort: "low",
    maxTokens: 12_000,
    timeoutMs: 120_000,
  });
  return out.cues
    .map((c) => sanitizeGeneratedCue(c))
    .filter((c): c is GeneratedCue => c !== null)
    .map((c, i) => ({ ...c, direction: "incoming" as const, kind: "question" as const, prompt: c.prompt || questions[i] || c.prompt }));
}

/* ------------------------------------------------------------------ */
/*  Mock conversation: a tough counterpart asks, grades and follows up */
/* ------------------------------------------------------------------ */

const MOCK_PERSONAS: Record<string, string> = {
  investor:
    "a sharp, sceptical seed or Series A investor (think a YC partner): direct, numbers-first, quick to probe weak market sizing, traction, competition, team and why now",
  interview: "an experienced hiring manager: probes for specifics, evidence and ownership, and notices vague or rehearsed answers",
  sales: "a busy, sceptical buyer: cares about price, ROI, risk, switching cost and proof",
  client: "a demanding client: cares about delivery, timelines, quality and accountability",
  partner: "a cautious potential partner: cares about fit, incentives, risk and who does what",
  negotiation: "a firm negotiator: pushes on price and terms and tests your walk-away point",
  viva: "a rigorous examiner: probes method, assumptions, limitations and contribution",
  presentation: "a sharp audience member: asks the awkward question everyone is thinking",
  other: "a tough, fair counterpart who probes for specifics",
};

export function mockPersona(meetingType: string): string {
  return MOCK_PERSONAS[meetingType] ?? MOCK_PERSONAS.other!;
}

const MockTurnSchema = z.object({
  score: z.number().int(),
  covered: z.array(z.string()),
  missed: z.array(z.string()),
  tip: z.string(),
  follow_up: z.string(),
});
export type MockTurn = { score: number; covered: string[]; missed: string[]; tip: string; followUp: string };

/**
 * One turn of a mock conversation. The persona grades the answer against the
 * prepared points and, on the first answer only, asks one follow-up that
 * presses on the weakest part.
 */
export async function mockTurn(
  pack: PackRow,
  question: string,
  bullets: string[],
  answer: string,
  allowFollowUp: boolean,
): Promise<MockTurn> {
  const out = await grokJson({
    schema: MockTurnSchema,
    name: "mock_turn",
    system:
      `You are ${mockPersona(pack.meeting_type)}, in a mock ${MEETING_TYPE_LABELS[pack.meeting_type].toLowerCase()} used for practice. ` +
      "Grade the person's spoken answer. score: 0-100 for substance, specifics and confidence (a real counterpart's judgement, not politeness). " +
      "covered: prepared points they made. missed: prepared points or obvious facts they left out. tip: one direct sentence on how to answer better. " +
      (allowFollowUp
        ? "follow_up: the single follow-up question you would ask next to press on the weakest or vaguest part, spoken naturally, under 25 words; empty string if the answer was excellent. "
        : "follow_up: empty string. ") +
      "Reply in the language the person used. Return JSON only.",
    user: `MEETING\n${packContext(pack)}\n\nQUESTION ASKED\n${question}\n\nTHEIR PREPARED POINTS\n${bullets.map((b) => `- ${b}`).join("\n") || "(none)"}\n\nTHEIR ANSWER\n${answer}`,
    model: liveModel(),
    effort: "low",
    maxTokens: 3_000,
  });
  return {
    score: Math.max(0, Math.min(100, out.score)),
    covered: out.covered.slice(0, 6),
    missed: out.missed.slice(0, 6),
    tip: out.tip,
    followUp: allowFollowUp ? out.follow_up.trim().slice(0, 300) : "",
  };
}

/** Extra rules for a job-interview pack built from a job description and a CV. */
export function meetingRules(meetingType: string): string {
  if (meetingType === "interview") {
    return "INTERVIEW: the sources include the job description and the candidate's CV. Cover: 'tell me about yourself', why this role and company, each main requirement in the job description, behavioural questions (answer bullets in STAR shorthand: situation, action, result with a number), technical questions for the role, weaknesses and gaps or short stints in the CV, salary expectations and notice period (give the approach, not invented figures). Bullets use only facts from the CV. Outgoing questions are smart questions to ask the interviewer about the team, the first 90 days and how success is measured.";
  }
  if (meetingType === "investor") {
    return "INVESTOR: include the hardest questions a sceptical partner asks: market size and why now, traction and growth rate, unit economics (CAC, LTV, payback, margins), competition and moat, team and why you, use of funds and milestones, valuation and round terms, biggest risks.";
  }
  return "";
}
