import { normalizeText } from "./text";

/**
 * The live matching engine.
 * Every cue (and each of its alternative phrasings) is turned into a vector
 * before the call. During the call, the last few seconds of speech become a
 * query vector and are compared against the index. Pure TypeScript, no I/O,
 * so it runs identically in the desktop app, the web app and tests.
 */

export type Vector = Float32Array | readonly number[];

/** Anything that turns text into vectors (local ONNX model, API, test stub). */
export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface IndexEntry {
  cueId: string;
  text: string;
  vector: Float32Array;
}

export interface MatcherOptions {
  /** Minimum cosine similarity before a card is shown. */
  threshold: number;
  /** Best cue must beat the runner-up cue by this much, or the match is ambiguous. */
  margin: number;
  /** The same cue will not be shown again within this many milliseconds. */
  cooldownMs: number;
}

export const DEFAULT_MATCHER_OPTIONS: MatcherOptions = {
  threshold: 0.6,
  margin: 0.03,
  cooldownMs: 30_000,
};

export interface CueScore {
  cueId: string;
  score: number;
  /** The phrasing that matched best. */
  text: string;
}

export interface MatchResult extends CueScore {
  runnerUpScore: number;
}

export function toUnitVector(v: Vector): Float32Array {
  const out = Float32Array.from(v);
  let sumSquares = 0;
  for (let i = 0; i < out.length; i++) sumSquares += out[i]! * out[i]!;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return out;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / norm;
  return out;
}

export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector size mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function cosineSimilarity(a: Vector, b: Vector): number {
  return dot(toUnitVector(a), toUnitVector(b));
}

/** The texts that represent one cue in the index: its prompt plus every variant. */
export function cueTexts(cue: { prompt: string; variants: readonly string[] }): string[] {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const t of [cue.prompt, ...cue.variants]) {
    const key = normalizeText(t);
    if (key.length > 0 && !seen.has(key)) {
      seen.add(key);
      texts.push(t);
    }
  }
  return texts;
}

/** Embed every cue phrasing in one batch and return index entries. */
export async function buildIndex(
  cues: readonly { id: string; prompt: string; variants: readonly string[] }[],
  embedder: Embedder,
): Promise<IndexEntry[]> {
  const pending: { cueId: string; text: string }[] = [];
  for (const cue of cues) {
    for (const text of cueTexts(cue)) pending.push({ cueId: cue.id, text });
  }
  if (pending.length === 0) return [];
  const vectors = await embedder.embed(pending.map((p) => p.text));
  if (vectors.length !== pending.length) {
    throw new Error(`Embedder returned ${vectors.length} vectors for ${pending.length} texts`);
  }
  return pending.map((p, i) => ({ ...p, vector: toUnitVector(vectors[i]!) }));
}

export class CueMatcher {
  private readonly entries: IndexEntry[];
  private readonly options: MatcherOptions;
  private readonly lastShown = new Map<string, number>();

  constructor(entries: readonly IndexEntry[], options: Partial<MatcherOptions> = {}) {
    this.entries = entries.map((e) => ({ ...e, vector: toUnitVector(e.vector) }));
    this.options = { ...DEFAULT_MATCHER_OPTIONS, ...options };
    const dims = new Set(this.entries.map((e) => e.vector.length));
    if (dims.size > 1) throw new Error("All index vectors must have the same size");
  }

  get size(): number {
    return this.entries.length;
  }

  /** Best score per cue, highest first. */
  rank(query: Vector, limit = 5): CueScore[] {
    const q = toUnitVector(query);
    const bestPerCue = new Map<string, CueScore>();
    for (const entry of this.entries) {
      const score = dot(q, entry.vector);
      const current = bestPerCue.get(entry.cueId);
      if (!current || score > current.score) {
        bestPerCue.set(entry.cueId, { cueId: entry.cueId, score, text: entry.text });
      }
    }
    return [...bestPerCue.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Returns a cue to show, or null.
   * Applies threshold, ambiguity margin and per-cue cooldown, and records the show.
   */
  match(query: Vector, nowMs: number): MatchResult | null {
    const [best, runnerUp] = this.rank(query, 2);
    if (!best || best.score < this.options.threshold) return null;
    const runnerUpScore = runnerUp?.score ?? 0;
    if (best.score - runnerUpScore < this.options.margin) return null;
    const last = this.lastShown.get(best.cueId);
    if (last !== undefined && nowMs - last < this.options.cooldownMs) return null;
    this.lastShown.set(best.cueId, nowMs);
    return { ...best, runnerUpScore };
  }

  /** Allow every cue to be shown again (e.g. new session). */
  resetCooldowns(): void {
    this.lastShown.clear();
  }
}

/**
 * Exact keyword triggers, for things embeddings handle badly:
 * names, product codes and numbers ("Q3", "SAR 40k", "Salesman").
 * Returns the ids of cues whose keyword appears as a whole word or phrase.
 */
export function keywordHits(
  windowText: string,
  cues: readonly { id: string; keywords: readonly string[] }[],
): string[] {
  const haystack = ` ${normalizeText(windowText)} `;
  const hits: string[] = [];
  for (const cue of cues) {
    const hit = cue.keywords.some((k) => {
      const needle = normalizeText(k);
      return needle.length > 0 && haystack.includes(` ${needle} `);
    });
    if (hit) hits.push(cue.id);
  }
  return hits;
}