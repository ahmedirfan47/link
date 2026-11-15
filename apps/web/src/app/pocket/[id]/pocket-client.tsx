"use client";

import { searchCues } from "@link/core";
import { useEffect, useMemo, useRef, useState } from "react";

export interface PocketCue {
  id: string;
  direction: "incoming" | "outgoing";
  kind: "question" | "topic" | "number" | "checklist";
  prompt: string;
  variants: string[];
  bullets: string[];
  keywords: string[];
  priority: number;
}

type Tab = "questions" | "numbers" | "mine";

/* ------------------------------------------------------------------ */
/*  Browser speech recognition (Chrome and Edge). Not in TypeScript's   */
/*  DOM types, so the small part we use is declared here.              */
/* ------------------------------------------------------------------ */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** How many of the latest spoken words are used to find a cue. */
const LISTEN_WINDOW_WORDS = 22;
/** A live match stays on screen at least this long, so it does not flicker. */
const HOLD_MS = 6000;

const LANGS = [
  { id: "en-US", label: "EN" },
  { id: "ur-PK", label: "UR" },
] as const;

function lastWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.slice(-n).join(" ");
}

function CueCard({ cue, highlight, open, onToggle }: { cue: PocketCue; highlight?: boolean; open: boolean; onToggle: () => void }) {
  return (
    <li
      className={`rounded-md border px-3 py-2 ${highlight ? "border-marker bg-marker-soft" : "border-line bg-surface"}`}
    >
      <button type="button" onClick={onToggle} className="block w-full text-left" aria-expanded={open}>
        <span className="block text-sm font-semibold leading-snug">{cue.prompt}</span>
      </button>
      {open && cue.bullets.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {cue.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-base leading-snug">
              <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function PocketClient({
  packId,
  title,
  language,
  cues,
}: {
  packId: string;
  title: string;
  language: string;
  cues: PocketCue[];
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("questions");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<string>(language.startsWith("ur") ? "ur-PK" : "en-US");
  const [heard, setHeard] = useState("");
  const [listenError, setListenError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [pinned, setPinned] = useState<{ id: string; score: number; at: number } | null>(null);

  const recognitionRef = useRef<Recognition | null>(null);
  const wantListening = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSupported(recognitionCtor() !== null), []);

  // "/" jumps to the search box, Escape clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        setQuery("");
        setPinned(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const typedHits = useMemo(() => searchCues(query, cues, { limit: 5, partial: true, minScore: 0.2 }), [query, cues]);

  // While listening, the latest words choose a card; it is held briefly so it does not jump.
  useEffect(() => {
    if (!listening || !heard) return;
    const [top] = searchCues(lastWords(heard, LISTEN_WINDOW_WORDS), cues, { limit: 1, minScore: 0.3 });
    if (!top) return;
    setPinned((current) => {
      const now = Date.now();
      if (!current || current.id === top.cue.id) return { id: top.cue.id, score: top.score, at: now };
      if (now - current.at > HOLD_MS || top.score > current.score + 0.15) {
        return { id: top.cue.id, score: top.score, at: now };
      }
      return current;
    });
  }, [heard, listening, cues]);

  function stopListening() {
    wantListening.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function startListening(language = lang) {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setListenError(null);
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText = lastWords(`${finalText} ${r[0].transcript}`, 60);
        else interim += r[0].transcript;
      }
      setHeard(lastWords(`${finalText} ${interim}`, 60));
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setListenError("Microphone access was blocked. Allow it in the address bar, then try again.");
        stopListening();
      } else if (e.error === "network") {
        setListenError("Listening needs an internet connection.");
      }
    };
    // Chrome stops after silence; start again for as long as the user wants to listen.
    rec.onend = () => {
      if (wantListening.current) {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      }
    };
    recognitionRef.current = rec;
    wantListening.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListenError("Could not start listening. Try again.");
    }
  }

  useEffect(() => () => stopListening(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const byTab: Record<Tab, PocketCue[]> = {
    questions: cues.filter((c) => c.direction === "incoming" && (c.kind === "question" || c.kind === "topic")),
    numbers: cues.filter((c) => c.kind === "number"),
    mine: cues.filter((c) => c.direction === "outgoing"),
  };
  const pinnedCue = pinned ? cues.find((c) => c.id === pinned.id) : undefined;
  const searching = query.trim().length > 0;

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <a
          href={`/packs/${packId}`}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-bold"
          title="Open the full pack"
        >
          {title}
        </a>
        {supported && (
          <>
            <div className="seg" role="group" aria-label="Listening language">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="seg-item px-1.5 text-2xs"
                  data-active={lang === l.id}
                  onClick={() => {
                    setLang(l.id);
                    if (listening) {
                      stopListening();
                      startListening(l.id);
                    }
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => (listening ? stopListening() : startListening())}
              className={listening ? "btn h-7 bg-tally px-2 text-xs hover:bg-tally" : "btn-line h-7 px-2 text-xs"}
              aria-pressed={listening}
            >
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${listening ? "animate-pulse bg-surface" : "bg-tally"}`}
              />
              {listening ? "Stop" : "Listen"}
            </button>
          </>
        )}
      </header>

      <div className="border-b border-line bg-surface px-3 pb-2">
        <label htmlFor="pocket-search" className="sr-only">
          Search cues
        </label>
        <input
          id="pocket-search"
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type what they asked…  ( / )"
          autoComplete="off"
          className="field mt-2 py-1.5 text-sm"
        />
        {listening && (
          <p className="mt-1.5 truncate text-2xs text-muted" aria-live="off">
            {heard ? `Heard: …${lastWords(heard, 14)}` : "Listening…"}
          </p>
        )}
        {listenError && <p className="mt-1.5 text-2xs text-tally">{listenError}</p>}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {cues.length === 0 ? (
          <p className="text-sm text-muted">
            No approved cues in this pack yet. Generate and approve cues on the pack page, then open Pocket again.
          </p>
        ) : searching ? (
          typedHits.length === 0 ? (
            <p className="text-sm text-muted">No cue matches “{query}”.</p>
          ) : (
            <ol className="space-y-2" aria-label="Matching cues">
              {typedHits.map((h, i) => (
                <CueCard
                  key={h.cue.id}
                  cue={h.cue}
                  highlight={i === 0}
                  open={i === 0 || openIds.has(h.cue.id)}
                  onToggle={() => toggle(h.cue.id)}
                />
              ))}
            </ol>
          )
        ) : (
          <>
            {pinnedCue && (
              <section className="mb-3" aria-label="Live match">
                <p className="mb-1 font-mono text-2xs text-muted">Live match</p>
                <ul>
                  <CueCard cue={pinnedCue} highlight open onToggle={() => setPinned(null)} />
                </ul>
              </section>
            )}
            <div className="seg mb-2 w-full">
              {(
                [
                  { id: "questions", label: `Questions ${byTab.questions.length}` },
                  { id: "numbers", label: `Numbers ${byTab.numbers.length}` },
                  { id: "mine", label: `My points ${byTab.mine.length}` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="seg-item flex-1 justify-center text-xs"
                  data-active={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <ul className="space-y-1.5">
              {byTab[tab].map((c) => (
                <CueCard key={c.id} cue={c} open={openIds.has(c.id)} onToggle={() => toggle(c.id)} />
              ))}
              {byTab[tab].length === 0 && <li className="text-sm text-muted">Nothing here yet.</li>}
            </ul>
          </>
        )}
      </main>

      {!supported && (
        <footer className="border-t border-line px-3 py-1.5 text-2xs text-muted">
          Listening works in Chrome and Edge. You can still type to search.
        </footer>
      )}
    </div>
  );
}
