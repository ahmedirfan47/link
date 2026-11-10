import {
  CueDirectionSchema,
  CueKindSchema,
  GeneratedPackSchema,
  LIMITS,
  type GeneratedCue,
  type GeneratedPack,
} from "./schemas";
import { normalizeText } from "./text";

/**
 * Models do not always respect length limits. Instead of failing a whole
 * generation because one bullet is too long, every field is trimmed and
 * clamped to Link's limits here, then validated.
 */

export interface RawGeneratedCue {
  direction?: unknown;
  kind?: unknown;
  prompt?: unknown;
  variants?: unknown;
  bullets?: unknown;
  keywords?: unknown;
  priority?: unknown;
}

export interface RawGeneratedPack {
  cues?: unknown;
  gaps?: unknown;
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

function cleanList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = clip(item, maxChars);
    const key = normalizeText(text);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function sanitizeGeneratedCue(raw: RawGeneratedCue): GeneratedCue | null {
  if (typeof raw.prompt !== "string") return null;
  const prompt = clip(raw.prompt, LIMITS.promptMaxChars);
  if (prompt.length === 0) return null;

  const direction = CueDirectionSchema.safeParse(raw.direction);
  const kind = CueKindSchema.safeParse(raw.kind);
  const priorityNumber = typeof raw.priority === "number" ? Math.round(raw.priority) : 2;
  const promptKey = normalizeText(prompt);

  return {
    direction: direction.success ? direction.data : "incoming",
    kind: kind.success ? kind.data : "question",
    prompt,
    variants: cleanList(raw.variants, LIMITS.variantsPerCue, LIMITS.variantMaxChars).filter(
      (v) => normalizeText(v) !== promptKey,
    ),
    bullets: cleanList(raw.bullets, LIMITS.bulletsPerCue, LIMITS.bulletMaxChars),
    keywords: cleanList(raw.keywords, LIMITS.keywordsPerCue, 60),
    priority: Math.min(3, Math.max(1, priorityNumber)),
  };
}

export function sanitizeGeneratedPack(raw: RawGeneratedPack): GeneratedPack {
  const seenPrompts = new Set<string>();
  const cues: GeneratedCue[] = [];
  if (Array.isArray(raw.cues)) {
    for (const item of raw.cues) {
      if (typeof item !== "object" || item === null) continue;
      const cue = sanitizeGeneratedCue(item as RawGeneratedCue);
      if (!cue) continue;
      const key = `${cue.direction}:${normalizeText(cue.prompt)}`;
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);
      cues.push(cue);
      if (cues.length >= LIMITS.cuesPerPack) break;
    }
  }
  const gaps = cleanList(raw.gaps, 30, 500);
  return GeneratedPackSchema.parse({ cues, gaps });
}