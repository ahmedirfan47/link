import type { CueDirection, CueKind } from "./schemas";
import { CueMatcher, buildIndex, keywordHits, type Embedder, type MatcherOptions } from "./matching";
import { RollingWindow, normalizeText, splitWords } from "./text";

/**
 * The live engine: turns a stream of transcript updates from two speakers into
 * cue events for the overlay. Pure logic with an injected embedder, so the same
 * code runs in the desktop app and in tests.
 *
 *  them  → matched against incoming cues (questions, topics, numbers)
 *  you   → ticks off outgoing checklist items, and powers the word finder:
 *          when you stall mid-sentence, the cue closest to what you were saying is resurfaced
 */

export type Speaker = "them" | "you";

export interface LiveCue {
  id: string;
  direction: CueDirection;
  kind: CueKind;
  prompt: string;
  variants: string[];
  bullets: string[];
  keywords: string[];
  priority: number;
}

export interface TranscriptUpdate {
  speaker: Speaker;
  /** Full text of the current turn so far (partial) or the finished turn (final). */
  text: string;
  final: boolean;
  atMs: number;
}

export type EngineEvent =
  | { type: "cue"; cue: LiveCue; reason: "match" | "keyword"; score: number; atMs: number }
  | { type: "hesitation"; cue: LiveCue; score: number; atMs: number }
  | { type: "checklist_done"; cue: LiveCue; atMs: number }
  | { type: "unmatched_question"; question: string; atMs: number };

export interface LiveEngineOptions extends MatcherOptions {
  /** Words of recent speech used for matching. */
  windowWords: number;
  /** Do not try to match before this many words have been heard in a turn. */
  minWords: number;
  /** Silence mid-sentence (ms) before the word finder steps in. */
  hesitationMs: number;
  /** Throttle for matching on partial transcripts. */
  evalIntervalMs: number;
}

export const DEFAULT_LIVE_OPTIONS: LiveEngineOptions = {
  threshold: 0.55,
  margin: 0.02,
  cooldownMs: 45_000,
  windowWords: 24,
  minWords: 4,
  hesitationMs: 1_600,
  evalIntervalMs: 350,
};

const QUESTION_STARTS = [
  "what", "how", "why", "when", "where", "who", "whom", "which", "whose",
  "can", "could", "would", "will", "do", "does", "did", "is", "are", "was", "were",
  "should", "have", "has", "tell me", "walk me", "explain", "describe", "give me",
];

const LEAD_INS = new Set(["and", "so", "but", "okay", "ok", "right", "well", "also", "now", "then", "um", "uh", "alright"]);

/** Rough check for whether a finished turn was a question. */
export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith("?") || trimmed.endsWith("؟")) return true;
  const normalized = normalizeText(trimmed);
  if (splitWords(normalized).length < 3) return false;
  // Look at the start of each sentence, since questions often follow a lead-in,
  // and skip spoken fillers such as "and", "so" or "okay" before the question word.
  return trimmed
    .split(/[.!,]\s+/)
    .map((s) => {
      const words = splitWords(s);
      while (words.length > 0 && LEAD_INS.has(words[0]!)) words.shift();
      return words.join(" ");
    })
    .some((s) => QUESTION_STARTS.some((q) => s === q || s.startsWith(`${q} `)));
}

interface SpeakerState {
  window: RollingWindow;
  turnWords: number;
  lastWordAt: number;
  lastText: string;
}

export class LiveEngine {
  private readonly options: LiveEngineOptions;
  private readonly cuesById = new Map<string, LiveCue>();
  private incoming: CueMatcher | null = null;
  private checklist: CueMatcher | null = null;
  private recall: CueMatcher | null = null;
  private readonly keywordCues: { id: string; keywords: string[] }[];
  private readonly keywordShownAt = new Map<string, number>();
  private readonly doneChecklist = new Set<string>();
  private readonly state: Record<Speaker, SpeakerState>;
  private shownThisTheirTurn = false;
  private lastEvalAt = -Infinity;
  private hesitationFired = false;

  constructor(
    private readonly cues: LiveCue[],
    private readonly embedder: Embedder,
    options: Partial<LiveEngineOptions> = {},
  ) {
    this.options = { ...DEFAULT_LIVE_OPTIONS, ...options };
    for (const c of cues) this.cuesById.set(c.id, c);
    this.keywordCues = cues
      .filter((c) => c.direction === "incoming" && c.keywords.length > 0)
      .map((c) => ({ id: c.id, keywords: c.keywords }));
    const make = () => ({
      window: new RollingWindow(this.options.windowWords),
      turnWords: 0,
      lastWordAt: 0,
      lastText: "",
    });
    this.state = { them: make(), you: make() };
  }

  /** Embeds every cue phrasing. Call once before the call starts. */
  async init(): Promise<void> {
    const incomingCues = this.cues.filter((c) => c.direction === "incoming");
    const checklistCues = this.cues.filter((c) => c.direction === "outgoing" && c.kind === "checklist");
    const recallCues = this.cues.filter((c) => c.bullets.length > 0);
    const matcherOptions: Partial<MatcherOptions> = {
      threshold: this.options.threshold,
      margin: this.options.margin,
      cooldownMs: this.options.cooldownMs,
    };
    this.incoming = new CueMatcher(await buildIndex(incomingCues, this.embedder), matcherOptions);
    this.checklist = new CueMatcher(await buildIndex(checklistCues, this.embedder), {
      ...matcherOptions,
      margin: 0,
      cooldownMs: Number.MAX_SAFE_INTEGER,
    });
    this.recall = new CueMatcher(await buildIndex(recallCues, this.embedder), {
      ...matcherOptions,
      threshold: this.options.threshold * 0.9,
      margin: 0,
      cooldownMs: 10_000,
    });
  }

  get checklistRemaining(): LiveCue[] {
    return this.cues.filter(
      (c) => c.direction === "outgoing" && c.kind === "checklist" && !this.doneChecklist.has(c.id),
    );
  }

  /** Feed every transcript update here. Returns the events it caused. */
  async onTranscript(update: TranscriptUpdate): Promise<EngineEvent[]> {
    if (!this.incoming || !this.checklist || !this.recall) {
      throw new Error("LiveEngine.init() must be called first");
    }
    return update.speaker === "them" ? this.onThem(update) : this.onYou(update);
  }

  /** Call every ~250 ms. Detects mid-sentence stalls for the word finder. */
  async tick(nowMs: number): Promise<EngineEvent[]> {
    const you = this.state.you;
    if (
      this.hesitationFired ||
      you.turnWords < 3 ||
      nowMs - you.lastWordAt < this.options.hesitationMs ||
      !this.recall
    ) {
      return [];
    }
    this.hesitationFired = true;
    const [vector] = await this.embedder.embed([you.window.text()]);
    if (!vector) return [];
    const match = this.recall.match(vector, nowMs);
    if (!match) return [];
    const cue = this.cuesById.get(match.cueId);
    return cue ? [{ type: "hesitation", cue, score: match.score, atMs: nowMs }] : [];
  }

  private updateWindow(s: SpeakerState, update: TranscriptUpdate): boolean {
    const words = splitWords(update.text).length;
    const grew = update.text !== s.lastText;
    if (grew) s.lastWordAt = update.atMs;
    s.lastText = update.final ? "" : update.text;
    if (update.final) {
      s.window.commit(update.text);
      s.turnWords = 0;
    } else {
      s.window.setPartial(update.text);
      s.turnWords = words;
    }
    return grew;
  }

  private async onThem(update: TranscriptUpdate): Promise<EngineEvent[]> {
    const s = this.state.them;
    const turnText = update.text;
    const turnWords = splitWords(turnText).length;
    this.updateWindow(s, update);

    const events: EngineEvent[] = [];

    // Exact keyword triggers (names, figures) fire immediately.
    for (const id of keywordHits(turnText, this.keywordCues)) {
      const last = this.keywordShownAt.get(id);
      if (last !== undefined && update.atMs - last < this.options.cooldownMs) continue;
      const cue = this.cuesById.get(id);
      if (!cue) continue;
      this.keywordShownAt.set(id, update.atMs);
      this.shownThisTheirTurn = true;
      events.push({ type: "cue", cue, reason: "keyword", score: 1, atMs: update.atMs });
    }

    const due = update.final || update.atMs - this.lastEvalAt >= this.options.evalIntervalMs;
    if (turnWords >= this.options.minWords && due) {
      events.push(...(await this.matchThem(turnText, update.atMs)));
    }

    if (update.final) {
      if (!this.shownThisTheirTurn && turnWords >= 3 && looksLikeQuestion(turnText)) {
        events.push({ type: "unmatched_question", question: turnText.trim(), atMs: update.atMs });
      }
      this.shownThisTheirTurn = false;
    }
    return events;
  }

  /**
   * Callers must feed updates one at a time (await each call); the desktop app
   * does this with a queue, so matching never runs twice at once.
   */
  private async matchThem(turnText: string, atMs: number): Promise<EngineEvent[]> {
    this.lastEvalAt = atMs;
    // Short turns ("and pricing?") borrow context from what was said just before.
    const query = splitWords(turnText).length >= 8 ? turnText : this.state.them.window.text();
    const [vector] = await this.embedder.embed([query]);
    if (!vector || !this.incoming) return [];
    const match = this.incoming.match(vector, atMs);
    if (!match) return [];
    const cue = this.cuesById.get(match.cueId);
    if (!cue) return [];
    this.shownThisTheirTurn = true;
    return [{ type: "cue", cue, reason: "match", score: match.score, atMs }];
  }

  private async onYou(update: TranscriptUpdate): Promise<EngineEvent[]> {
    const s = this.state.you;
    const grew = this.updateWindow(s, update);
    if (grew) this.hesitationFired = false;
    if (!update.final || !this.checklist) return [];

    const [vector] = await this.embedder.embed([update.text]);
    if (!vector) return [];
    const match = this.checklist.match(vector, update.atMs);
    if (!match || this.doneChecklist.has(match.cueId)) return [];
    this.doneChecklist.add(match.cueId);
    const cue = this.cuesById.get(match.cueId);
    return cue ? [{ type: "checklist_done", cue, atMs: update.atMs }] : [];
  }
}