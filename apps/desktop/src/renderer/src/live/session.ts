import { LiveEngine, type EngineEvent, type LiveCue, type Speaker } from "@link/core";
import type {
  CardKind,
  OverlayCard,
  OverlayState,
  PackDetail,
  SessionEndResult,
  SessionEventInput,
  Settings,
} from "../../../shared/types";
import { getMicrophone, getSystemAudio, startPcmPipe, stopStream, type AudioPipe } from "./audio";
import { loadEmbedder, thresholdFor } from "./embedder";
import { SttStream } from "./stt";

/**
 * Runs one live call: audio → transcription → matching → overlay cards,
 * and reports the session to the server when it ends.
 */

export type Phase = "idle" | "preparing" | "live" | "ending" | "ended" | "error";

export interface TranscriptLine {
  speaker: Speaker;
  text: string;
  final: boolean;
}

export interface LiveSnapshot {
  phase: Phase;
  message: string;
  packTitle: string;
  startedAt: number | null;
  levels: Record<Speaker, number>;
  transcript: TranscriptLine[];
  cards: OverlayCard[];
  checklist: OverlayState["checklist"];
  stats: { cues: number; unprepared: number; hesitations: number };
  matcher: string;
  result: SessionEndResult | null;
  /** Server id of this call, for the "open in dashboard" link. */
  sessionId: string | null;
}

const MAX_CARDS = 3;
const CARD_TTL_MS: Record<CardKind, number> = {
  answer: 25_000,
  topic: 20_000,
  number: 40_000,
  recall: 15_000,
  unprepared: 30_000,
};
const FALLBACK_MIN_GAP_MS = 6_000;
const MAX_RECONNECTS = 3;

export function emptySnapshot(): LiveSnapshot {
  return {
    phase: "idle",
    message: "",
    packTitle: "",
    startedAt: null,
    levels: { you: 0, them: 0 },
    transcript: [],
    cards: [],
    checklist: [],
    stats: { cues: 0, unprepared: 0, hesitations: 0 },
    matcher: "",
    result: null,
    sessionId: null,
  };
}

function cardKind(cue: LiveCue): CardKind {
  if (cue.kind === "number") return "number";
  if (cue.kind === "topic") return "topic";
  return "answer";
}

export class LiveSession {
  private snap: LiveSnapshot = emptySnapshot();
  private listener: (s: LiveSnapshot) => void = () => {};
  private emitScheduled = false;

  private detail: PackDetail | null = null;
  private engine: LiveEngine | null = null;
  private sessionId: string | null = null;
  private language = "en";
  private settings: Settings | null = null;

  private streams: { mic: MediaStream | null; system: MediaStream | null } = { mic: null, system: null };
  private pipes: AudioPipe[] = [];
  private stt: Partial<Record<Speaker, SttStream>> = {};
  private reconnects: Record<Speaker, number> = { you: 0, them: 0 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Promise<void> = Promise.resolve();

  private partial: Record<Speaker, string> = { you: "", them: "" };
  private finals: { speaker: Speaker; text: string }[] = [];
  private events: SessionEventInput[] = [];
  private unmatched: string[] = [];
  private lastFallbackAt = -Infinity;
  private fallbackBusy = false;
  private fallbackCount = 0;

  onChange(listener: (s: LiveSnapshot) => void): void {
    this.listener = listener;
    listener(this.snap);
  }

  get snapshot(): LiveSnapshot {
    return this.snap;
  }

  private set(patch: Partial<LiveSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    setTimeout(() => {
      this.emitScheduled = false;
      this.listener(this.snap);
    }, 100);
  }

  private pushOverlay(): void {
    const status: OverlayState["status"] =
      this.snap.phase === "live" ? "listening" : this.snap.phase === "preparing" ? "starting" : this.snap.phase === "error" ? "error" : "idle";
    window.link.overlay.update({
      status,
      packTitle: this.snap.packTitle,
      cards: this.snap.cards,
      checklist: this.snap.checklist,
      clickThrough: false,
      textSize: this.settings?.overlayTextSize ?? "m",
    });
  }

  private elapsed(): number {
    return this.snap.startedAt ? Math.max(0, Math.round(Date.now() - this.snap.startedAt)) : 0;
  }

  private log(type: SessionEventInput["type"], payload: Record<string, unknown>): void {
    if (this.events.length < 2_000) this.events.push({ tMs: this.elapsed(), type, payload });
  }

  /* ---------------------------------------------------------------- */
  /*  Start                                                            */
  /* ---------------------------------------------------------------- */

  async start(packId: string, settings: Settings): Promise<void> {
    this.settings = settings;
    this.set({ ...emptySnapshot(), phase: "preparing", message: "Loading your pack…" });
    this.pushOverlay();
    try {
      const packResult = await window.link.api.getPack(packId);
      if (!packResult.ok) throw new Error(packResult.error);
      this.detail = packResult.data;
      this.language = packResult.data.pack.language || "en";
      const cues = packResult.data.cues as LiveCue[];
      if (cues.length === 0) throw new Error("This pack has no approved cues. Approve some in the dashboard first.");
      this.set({ packTitle: packResult.data.pack.title });

      const loaded = await loadEmbedder(this.language, (message) => this.set({ message }));
      this.set({ message: `Preparing ${cues.length} cues…`, matcher: loaded.name });
      this.engine = new LiveEngine(cues, loaded.embedder, {
        threshold: thresholdFor(loaded.quality, settings.sensitivity),
      });
      await this.engine.init();
      this.set({
        checklist: this.engine.checklistRemaining.map((c) => ({ id: c.id, text: c.prompt, done: false })),
      });

      this.set({ message: "Starting the session…" });
      const sessionResult = await window.link.api.startSession(packId, packResult.data.pack.title);
      if (!sessionResult.ok) throw new Error(sessionResult.error);
      this.sessionId = sessionResult.data.id;
      this.set({ sessionId: sessionResult.data.id });

      this.set({ message: "Opening the microphone…" });
      this.streams.mic = await getMicrophone(settings.micDeviceId);
      if (settings.mode === "laptop") {
        this.set({ message: "Capturing the call audio…" });
        this.streams.system = await getSystemAudio();
      }

      this.set({ message: "Connecting live transcription…" });
      const keyterms = cues.flatMap((c) => c.keywords);
      if (settings.mode === "laptop") {
        await this.openStt("you", keyterms);
        await this.openStt("them", keyterms);
        this.pipes.push(await startPcmPipe(this.streams.mic, (pcm, level) => this.feed("you", pcm, level)));
        this.pipes.push(await startPcmPipe(this.streams.system!, (pcm, level) => this.feed("them", pcm, level)));
      } else {
        // One microphone hears both sides; everything is matched as "them".
        await this.openStt("them", keyterms);
        this.pipes.push(await startPcmPipe(this.streams.mic, (pcm, level) => this.feed("them", pcm, level)));
      }

      this.timer = setInterval(() => this.onTick(), 250);
      this.set({ phase: "live", startedAt: Date.now(), message: "Listening" });
      window.link.overlay.show();
      this.pushOverlay();
    } catch (err) {
      await this.teardown();
      this.set({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      this.pushOverlay();
    }
  }

  private async openStt(speaker: Speaker, keyterms: string[]): Promise<void> {
    const token = await window.link.api.sttToken(this.language);
    if (!token.ok) throw new Error(token.error);
    const stream = new SttStream({
      token: token.data,
      keyterms,
      onTurn: (update) => this.onTurn(speaker, update.text, update.final),
      onDrop: (reason) => void this.reconnect(speaker, keyterms, reason),
    });
    await stream.connect();
    this.stt[speaker] = stream;
  }

  private async reconnect(speaker: Speaker, keyterms: string[], reason: string): Promise<void> {
    if (this.snap.phase !== "live") return;
    if (this.reconnects[speaker] >= MAX_RECONNECTS) {
      this.set({ message: `Transcription for ${speaker === "you" ? "your voice" : "the other side"} stopped: ${reason}` });
      return;
    }
    this.reconnects[speaker] += 1;
    this.set({ message: "Reconnecting transcription…" });
    try {
      await this.openStt(speaker, keyterms);
      this.set({ message: "Listening" });
    } catch (err) {
      this.set({ message: `Reconnect failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private feed(speaker: Speaker, pcm: ArrayBuffer, level: number): void {
    this.stt[speaker]?.send(pcm);
    const smoothed = Math.min(1, level * 4);
    if (Math.abs(smoothed - this.snap.levels[speaker]) > 0.03) {
      this.set({ levels: { ...this.snap.levels, [speaker]: smoothed } });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Live                                                             */
  /* ---------------------------------------------------------------- */

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((err) => console.error("Live engine error", err));
  }

  private onTurn(speaker: Speaker, text: string, final: boolean): void {
    const atMs = this.elapsed();
    if (final) {
      this.finals.push({ speaker, text });
      this.partial[speaker] = "";
    } else {
      this.partial[speaker] = text;
    }
    this.updateTranscript(speaker, text, final);
    this.enqueue(async () => {
      if (!this.engine) return;
      this.handle(await this.engine.onTranscript({ speaker, text, final, atMs }));
    });
  }

  private updateTranscript(speaker: Speaker, text: string, final: boolean): void {
    const lines = this.snap.transcript.filter((l) => l.final || l.speaker !== speaker);
    lines.push({ speaker, text, final });
    this.set({ transcript: lines.slice(-12) });
  }

  private onTick(): void {
    const now = Date.now();
    const cards = this.snap.cards.filter((c) => now - c.createdAt < CARD_TTL_MS[c.kind]);
    if (cards.length !== this.snap.cards.length) {
      this.set({ cards });
      this.pushOverlay();
    }
    this.enqueue(async () => {
      if (!this.engine) return;
      this.handle(await this.engine.tick(this.elapsed()));
    });
  }

  private addCard(card: Omit<OverlayCard, "createdAt">): void {
    const now = Date.now();
    const existing = this.snap.cards.find((c) => c.id === card.id);
    const cards = existing
      ? this.snap.cards.map((c) => (c.id === card.id ? { ...c, ...card, createdAt: now } : c))
      : [{ ...card, createdAt: now }, ...this.snap.cards].slice(0, MAX_CARDS);
    // Newest first.
    cards.sort((a, b) => b.createdAt - a.createdAt);
    this.set({ cards });
    this.pushOverlay();
  }

  private handle(events: EngineEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "cue": {
          const { cue } = event;
          this.addCard({
            id: cue.id,
            kind: cardKind(cue),
            title: cue.prompt,
            bullets: cue.bullets.length > 0 ? cue.bullets : ["No answer yet. Add one on the website."],
            meta: event.reason === "keyword" ? "Keyword" : `${Math.round(event.score * 100)}% match`,
          });
          this.set({ stats: { ...this.snap.stats, cues: this.snap.stats.cues + 1 } });
          this.log("cue_shown", { cueId: cue.id, prompt: cue.prompt, score: event.score, reason: event.reason });
          break;
        }
        case "hesitation": {
          const { cue } = event;
          this.addCard({ id: `recall-${cue.id}`, kind: "recall", title: cue.prompt, bullets: cue.bullets, meta: "Word finder" });
          this.set({ stats: { ...this.snap.stats, hesitations: this.snap.stats.hesitations + 1 } });
          this.log("hesitation", { cueId: cue.id, prompt: cue.prompt, context: this.partial.you });
          break;
        }
        case "checklist_done": {
          this.set({
            checklist: this.snap.checklist.map((c) => (c.id === event.cue.id ? { ...c, done: true } : c)),
          });
          this.pushOverlay();
          this.log("checklist_done", { cueId: event.cue.id, prompt: event.cue.prompt });
          break;
        }
        case "unmatched_question": {
          if (this.unmatched.length < 100) this.unmatched.push(event.question.slice(0, 300));
          this.log("unmatched_question", { question: event.question });
          void this.askFallback(event.question);
          break;
        }
      }
    }
  }

  private async askFallback(question: string): Promise<void> {
    const now = Date.now();
    if (!this.detail || this.fallbackBusy || now - this.lastFallbackAt < FALLBACK_MIN_GAP_MS) return;
    this.fallbackBusy = true;
    this.lastFallbackAt = now;
    try {
      const result = await window.link.api.fallback(this.detail.pack.id, question);
      if (!result.ok || this.snap.phase !== "live") return;
      this.fallbackCount += 1;
      this.addCard({
        id: `fallback-${this.fallbackCount}`,
        kind: "unprepared",
        title: question,
        bullets: result.data.bullets,
        meta: result.data.confident ? "From your notes" : "Unprepared",
      });
      this.set({ stats: { ...this.snap.stats, unprepared: this.snap.stats.unprepared + 1 } });
      this.log("fallback_cue", { question, bullets: result.data.bullets, confident: result.data.confident });
    } finally {
      this.fallbackBusy = false;
    }
  }

  dismiss(cardId: string): void {
    const card = this.snap.cards.find((c) => c.id === cardId);
    if (!card) return;
    this.set({ cards: this.snap.cards.filter((c) => c.id !== cardId) });
    this.pushOverlay();
    this.log("cue_dismissed", { cardId, title: card.title });
  }

  clearCards(): void {
    if (this.snap.cards.length === 0) return;
    this.set({ cards: [] });
    this.pushOverlay();
  }

  /* ---------------------------------------------------------------- */
  /*  Stop                                                             */
  /* ---------------------------------------------------------------- */

  private async teardown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const pipe of this.pipes) pipe.stop();
    this.pipes = [];
    this.stt.you?.close();
    this.stt.them?.close();
    this.stt = {};
    stopStream(this.streams.mic);
    stopStream(this.streams.system);
    this.streams = { mic: null, system: null };
    await this.queue;
  }

  async stop(): Promise<void> {
    if (this.snap.phase !== "live") return;
    this.set({ phase: "ending", message: this.settings?.summarize ? "Writing your call summary…" : "Saving the session…", cards: [] });
    this.pushOverlay();
    await this.teardown();

    let result: SessionEndResult | null = null;
    if (this.sessionId) {
      const response = await window.link.api.endSession(this.sessionId, {
        events: this.events,
        transcript: this.settings?.summarize ? this.finals : undefined,
        unmatchedQuestions: this.unmatched,
      });
      if (response.ok) result = response.data;
      else this.set({ message: `Could not save the session: ${response.error}` });
    }
    this.set({ phase: "ended", result, levels: { you: 0, them: 0 } });
    this.pushOverlay();
  }

  reset(): void {
    this.snap = emptySnapshot();
    this.listener(this.snap);
    this.pushOverlay();
  }
}