import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  CueDirectionSchema,
  CueKindSchema,
  sanitizeGeneratedCue,
  sanitizeGeneratedPack,
  type GeneratedCue,
  type GeneratedPack,
} from "@link/core";
import { anthropicApiKey, liveModel, packModel } from "@/lib/env";
import { MEETING_TYPE_LABELS, type CueRow, type PackRow } from "@/lib/rows";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: anthropicApiKey() });
  return client;
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

GAPS: up to 20 short, specific questions to ask the user, for facts the sources do not cover but the counterpart is likely to probe (for example "What is your current monthly revenue?").`;

/** Builds the full cue pack for a pack from its source texts. */
export async function generatePack(
  pack: PackRow,
  sources: { title: string; kind: string; text: string }[],
): Promise<GeneratedPack> {
  let budget = MAX_PROMPT_SOURCE_CHARS;
  const blocks: string[] = [];
  for (const [i, s] of sources.entries()) {
    if (budget <= 0) break;
    const text = s.text.slice(0, budget);
    budget -= text.length;
    blocks.push(`<source index="${i + 1}" kind="${s.kind}" title="${s.title.replace(/"/g, "'")}">\n${text}\n</source>`);
  }

  const stream = anthropic().messages.stream({
    model: packModel(),
    max_tokens: 32_000,
    system: PACK_SYSTEM,
    messages: [
      {
        role: "user",
        content: `MEETING\n${packContext(pack)}\n\nSOURCES\n${blocks.join("\n\n")}\n\nBuild the cue pack now.`,
      },
    ],
    output_config: { format: zodOutputFormat(ModelPackSchema) },
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "max_tokens") {
    throw new Error("The pack was too large to finish. Remove some sources and try again.");
  }
  if (!message.parsed_output) throw new Error("The model did not return a cue pack. Try again.");
  return sanitizeGeneratedPack(message.parsed_output);
}

/** Turns the user's answer to a gap question into an approved incoming cue. */
export async function cueFromGapAnswer(
  pack: PackRow,
  question: string,
  answer: string,
): Promise<GeneratedCue> {
  const message = await anthropic().messages.parse({
    model: liveModel(),
    max_tokens: 2_000,
    system:
      "You turn a person's answer into one Link cue card. direction=incoming, kind=question. prompt = the question. variants = 4-8 spoken ways the other side might ask it. bullets = at most 3 fragments under 12 words, using only facts in the answer. keywords = exact trigger words (names, figures), may be empty. priority 1-3.",
    messages: [
      {
        role: "user",
        content: `MEETING\n${packContext(pack)}\n\nQUESTION\n${question}\n\nMY ANSWER\n${answer}`,
      },
    ],
    output_config: { format: zodOutputFormat(ModelCueSchema) },
  });
  const cue = message.parsed_output ? sanitizeGeneratedCue(message.parsed_output) : null;
  if (!cue) throw new Error("Could not turn that answer into a cue. Try rephrasing it.");
  return { ...cue, direction: "incoming", kind: "question", prompt: cue.prompt || question };
}

/** Grades a rehearsal answer against the cue's bullets. */
export async function gradeAnswer(
  pack: PackRow,
  cue: Pick<CueRow, "prompt" | "bullets">,
  answer: string,
): Promise<Grade> {
  const message = await anthropic().messages.parse({
    model: liveModel(),
    max_tokens: 1_000,
    system:
      "You are a concise speaking coach. Compare the user's spoken answer with their prepared key points. score: 0-100 for how well the answer covers the key points clearly and confidently. covered: key points they made. missed: key points they left out. tip: one sentence on how to say it better next time. Be direct and specific.",
    messages: [
      {
        role: "user",
        content: `MEETING\n${packContext(pack)}\n\nQUESTION\n${cue.prompt}\n\nPREPARED KEY POINTS\n${cue.bullets.map((b) => `- ${b}`).join("\n") || "(none)"}\n\nMY ANSWER\n${answer}`,
      },
    ],
    output_config: { format: zodOutputFormat(GradeSchema) },
  });
  const grade = message.parsed_output;
  if (!grade) throw new Error("Could not grade that answer. Try again.");
  return { ...grade, score: Math.max(0, Math.min(100, grade.score)) };
}