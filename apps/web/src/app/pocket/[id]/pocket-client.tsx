"use client";

import { looksLikeQuestion, searchCues } from "@link/core";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { captureCallTab, startTranscriber, type LiveTranscriber } from "@/lib/live-audio";
import { hideCard, markUseful, recordMiss, saveAnswerAsCard } from "./actions";

export interface PocketCue {
  id: string;
  direction: "incoming" | "outgoing";
  kind: "question" | "topic" | "number" | "checklist";
  prompt: string;
  variants: string[];
  bullets: string[];
  keywords: string[];
  priority: number;
  useful: number;
}

type Tab = "questions" | "numbers" | "mine";
type Source = "mic" | "tab";

interface GrokAnswer {
  question: string;
  bullets: string[];
  confident: boolean;
  sources: string[];
  saved?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Browser speech recognition (Chrome and Edge), for the microphone.  */
/*  Not in TypeScript's DOM types, so the small part used is declared. */
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
  { id: "en-US", label: "EN", stt: "en" },
  { id: "ur-PK", label: "UR", stt: "ur-en" },
  { id: "ar-SA", label: "AR", stt: "ar-en" },
] as const;

/** The line users can paste into the meeting chat, so everyone knows. */
export const CONSENT_MESSAGE =
  "Quick note before we start: I use an AI assistant that takes notes during calls. Is that okay with you?";
const CONSENT_KEY = "link.consent.v1";

function consentGiven(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function lastWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.slice(-n).join(" ");
}

function CueCard({
  cue,
  highlight,
  open,
  onToggle,
  canEdit,
  onUseful,
  onHide,
}: {
  cue: PocketCue;
  highlight?: boolean;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onUseful: (cue: PocketCue) => void;
  onHide: (cue: PocketCue) => void;
}) {
  return (
    <li className={`group rounded-md border px-3 py-2 ${highlight ? "border-marker bg-marker-soft" : "border-line bg-surface"}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span dir="auto" className="block text-sm font-semibold leading-snug">
            {cue.prompt}
          </span>
        </button>
        <span className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => onUseful(cue)}
            className="rounded px-1 text-xs text-muted hover:bg-sunken hover:text-ink"
            title="This card helped"
            aria-label={`This card helped (${cue.useful})`}
          >
            ★{cue.useful > 0 ? ` ${cue.useful}` : ""}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onHide(cue)}
              className="rounded px-1 text-xs text-muted hover:bg-sunken hover:text-tally"
              title="Hide this card from live use"
              aria-label="Hide this card"
            >
              ✕
            </button>
          )}
        </span>
      </div>
      {open && cue.bullets.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {cue.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-base leading-snug">
              <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
              <span dir="auto">{b}</span>
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
  canEdit,
  cues: initialCues,
}: {
  packId: string;
  title: string;
  language: string;
  canEdit: boolean;
  cues: PocketCue[];
}) {
  const [cues, setCues] = useState<PocketCue[]>(initialCues);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("questions");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<Source>("mic");
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [lang, setLang] = useState<string>(
    language.startsWith("ur") ? "ur-PK" : language.startsWith("ar") ? "ar-SA" : "en-US",
  );
  const [heard, setHeard] = useState("");
  const [lastSentence, setLastSentence] = useState("");
  const [listenError, setListenError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(false);
  const [tabSupported, setTabSupported] = useState(false);
  const [pinned, setPinned] = useState<{ id: string; score: number; at: number } | null>(null);
  const [answer, setAnswer] = useState<GrokAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const consentThisSession = useRef(false);
  const [, startAction] = useTransition();

  const recognitionRef = useRef<Recognition | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const wantListening = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMicSupported(recognitionCtor() !== null);
    setTabSupported(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia));
  }, []);

  // "/" jumps to the search box, Escape clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        setQuery("");
        setPinned(null);
        setAnswer(null);
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

  /* -------------------------- listening ------------------------------ */

  const missed = useRef<Set<string>>(new Set());

  function onFinalSentence(text: string) {
    if (!looksLikeQuestion(text)) return;
    const q = text.trim();
    setLastSentence(q);
    // Keep a record of questions no card covered, once each, for the pack and the team playbook.
    if (searchCues(q, cues, { limit: 1, minScore: 0.3 }).length === 0 && !missed.current.has(q.toLowerCase())) {
      missed.current.add(q.toLowerCase());
      void recordMiss(packId, q);
    }
  }

  function stopListening() {
    wantListening.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    transcriberRef.current?.stop();
    transcriberRef.current = null;
    setListening(false);
  }

  function startMic(language = lang) {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) {
          finalText = lastWords(`${finalText} ${r[0].transcript}`, 60);
          onFinalSentence(r[0].transcript);
        } else interim += r[0].transcript;
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
    rec.start();
    setListening(true);
  }

  async function startTab(language = lang) {
    // Ask for the tab first: the browser only allows it straight after the click.
    const stream = await captureCallTab();
    try {
      const sttLang = LANGS.find((l) => l.id === language)?.stt ?? "en";
      const res = await fetch("/api/stt-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: sttLang }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        speechModel?: string;
        url?: string;
        sampleRate?: number;
      };
      if (!res.ok || !json.token) throw new Error(json.error ?? "Could not start live transcription.");

      let finals = "";
      transcriberRef.current = await startTranscriber(
        stream,
        { token: json.token, speechModel: json.speechModel!, url: json.url!, sampleRate: json.sampleRate! },
        cues.flatMap((c) => c.keywords),
        (text, final) => {
          if (final) {
            finals = lastWords(`${finals} ${text}`, 60);
            onFinalSentence(text);
            setHeard(finals);
          } else {
            setHeard(lastWords(`${finals} ${text}`, 60));
          }
        },
        (reason) => {
          setListenError(reason === "Sharing stopped." ? null : reason);
          stopListening();
        },
      );
      wantListening.current = true;
      setListening(true);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw err;
    }
  }

  async function startListening(src = source, language = lang) {
    // Honest by design: remind the user to tell the others before listening.
    if (!consentThisSession.current && !consentGiven()) {
      setAskConsent(true);
      return;
    }
    setListenError(null);
    setStarting(true);
    try {
      if (src === "mic") startMic(language);
      else await startTab(language);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start listening.";
      setListenError(/denied|NotAllowed|Permission/i.test(message) ? "Sharing was cancelled." : message);
      stopListening();
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => () => stopListening(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------- cards -------------------------------- */

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onUseful(cue: PocketCue) {
    setCues((cs) => cs.map((c) => (c.id === cue.id ? { ...c, useful: c.useful + 1 } : c)));
    startAction(async () => {
      const result = await markUseful(packId, cue.id);
      if (result.error) setNotice(result.error);
    });
  }

  function onHide(cue: PocketCue) {
    setCues((cs) => cs.filter((c) => c.id !== cue.id));
    if (pinned?.id === cue.id) setPinned(null);
    setNotice(`Hidden “${cue.prompt.slice(0, 40)}”. Approve it again on the pack page to bring it back.`);
    startAction(async () => {
      const result = await hideCard(packId, cue.id);
      if (result.error) setNotice(result.error);
    });
  }

  /* --------------------------- Ask Grok ------------------------------ */

  async function askGrok(question: string) {
    const q = question.trim();
    if (q.length < 3 || asking) return;
    setAsking(true);
    setAskError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/pocket-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, question: q }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        bullets?: string[];
        confident?: boolean;
        sources?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? "Could not get an answer.");
      setAnswer({ question: q, bullets: json.bullets ?? [], confident: Boolean(json.confident), sources: json.sources ?? [] });
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Could not get an answer.");
    } finally {
      setAsking(false);
    }
  }

  function saveAnswer() {
    if (!answer) return;
    const current = answer;
    startAction(async () => {
      const result = await saveAnswerAsCard(packId, current.question, current.bullets);
      if (result.error || !result.id) {
        setNotice(result.error ?? "Could not save the card.");
        return;
      }
      setAnswer({ ...current, saved: true });
      setCues((cs) => [
        ...cs,
        {
          id: result.id!,
          direction: "incoming",
          kind: "question",
          prompt: current.question,
          variants: [],
          bullets: current.bullets,
          keywords: [],
          priority: 1,
          useful: 0,
        },
      ]);
    });
  }

  /* ---------------------------- render ------------------------------- */

  const byTab: Record<Tab, PocketCue[]> = {
    questions: cues.filter((c) => c.direction === "incoming" && (c.kind === "question" || c.kind === "topic")),
    numbers: cues.filter((c) => c.kind === "number"),
    mine: cues.filter((c) => c.direction === "outgoing"),
  };
  const pinnedCue = pinned ? cues.find((c) => c.id === pinned.id) : undefined;
  const searching = query.trim().length > 0;
  // What "Ask Grok" would ask: what you typed, or the last question heard with no card for it.
  const unansweredHeard =
    listening && lastSentence && searchCues(lastSentence, cues, { limit: 1, minScore: 0.3 }).length === 0 ? lastSentence : "";
  const askable = searching ? (typedHits.length === 0 || typedHits[0]!.score < 0.45 ? query.trim() : "") : unansweredHeard;
  const cardProps = { canEdit, onUseful, onHide };

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
        <a
          href={canEdit ? `/packs/${packId}` : `/shared/${packId}`}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-bold"
          title="Open the full pack"
        >
          {title}
        </a>
        {(micSupported || tabSupported) && (
          <>
            <div className="seg" role="group" aria-label="What to listen to">
              {micSupported && (
                <button
                  type="button"
                  className="seg-item px-1.5 text-2xs"
                  data-active={source === "mic"}
                  disabled={listening || starting}
                  onClick={() => setSource("mic")}
                  title="Your microphone (the room)"
                >
                  Mic
                </button>
              )}
              {tabSupported && (
                <button
                  type="button"
                  className="seg-item px-1.5 text-2xs"
                  data-active={source === "tab"}
                  disabled={listening || starting}
                  onClick={() => setSource("tab")}
                  title="The call's browser tab (Google Meet, Zoom, Teams in the browser)"
                >
                  Call tab
                </button>
              )}
            </div>
            <div className="seg" role="group" aria-label="Listening language">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="seg-item px-1.5 text-2xs"
                  data-active={lang === l.id}
                  disabled={starting}
                  onClick={() => {
                    setLang(l.id);
                    if (listening) {
                      stopListening();
                      void startListening(source, l.id);
                    }
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => (listening ? stopListening() : void startListening())}
              disabled={starting}
              className={listening ? "btn h-7 bg-tally px-2 text-xs hover:bg-tally" : "btn-line h-7 px-2 text-xs"}
              aria-pressed={listening}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${listening ? "animate-pulse bg-surface" : "bg-tally"}`} />
              {starting ? "…" : listening ? "Stop" : "Listen"}
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
          onChange={(e) => {
            setQuery(e.target.value);
            setAnswer(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && askable) void askGrok(askable);
          }}
          placeholder="Type what they asked…  ( / )"
          autoComplete="off"
          className="field mt-2 py-1.5 text-sm"
        />
        {listening && (
          <p className="mt-1.5 truncate text-2xs text-muted">
            {source === "tab" ? "Call tab · " : "Mic · "}
            {heard ? `…${lastWords(heard, 14)}` : "Listening…"}
          </p>
        )}
        {listenError && <p className="mt-1.5 text-2xs text-tally">{listenError}</p>}
        {askConsent && (
          <div className="mt-2 rounded-md border border-line-strong bg-canvas px-2.5 py-2" role="dialog" aria-label="Tell the others">
            <p className="text-xs font-semibold">Tell the people on the call you are using Link.</p>
            <p className="mt-0.5 text-2xs text-muted">
              It is polite, and in some places the law requires everyone to agree. Paste this in the meeting chat:
            </p>
            <p className="mt-1.5 rounded bg-surface px-2 py-1 text-2xs text-ink-2">{CONSENT_MESSAGE}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="btn-line h-6 px-2 text-2xs"
                onClick={() => {
                  void navigator.clipboard?.writeText(CONSENT_MESSAGE).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy message"}
              </button>
              <button
                type="button"
                className="btn h-6 px-2 text-2xs"
                onClick={() => {
                  consentThisSession.current = true;
                  setAskConsent(false);
                  void startListening();
                }}
              >
                I&apos;ve told them, listen
              </button>
              <button
                type="button"
                className="btn-quiet h-6 px-1.5 text-2xs"
                onClick={() => {
                  try {
                    window.localStorage.setItem(CONSENT_KEY, "1");
                  } catch {
                    /* storage unavailable */
                  }
                  consentThisSession.current = true;
                  setAskConsent(false);
                  void startListening();
                }}
              >
                Don&apos;t remind me
              </button>
            </div>
          </div>
        )}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {notice && (
          <p className="mb-2 flex items-start gap-2 rounded-md bg-sunken px-2.5 py-1.5 text-2xs text-ink-2">
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-ink" aria-label="Close">
              ✕
            </button>
          </p>
        )}

        {(askable || answer || asking || askError) && (
          <section className="mb-3 rounded-md border border-line-strong bg-surface px-3 py-2" aria-label="Ask Grok">
            {answer ? (
              <>
                <p className="mb-1 text-2xs text-muted">
                  Grok · {answer.confident ? "from your sources" : "not in your sources: an approach"}
                </p>
                <p className="text-sm font-semibold leading-snug">{answer.question}</p>
                <ul className="mt-1.5 space-y-1">
                  {answer.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-base leading-snug">
                      <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                      <span dir="auto">{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-2">
                  {answer.sources.length > 0 && (
                    <p className="min-w-0 flex-1 truncate text-2xs text-faint">{answer.sources.join(" · ")}</p>
                  )}
                  {canEdit &&
                    (answer.saved ? (
                      <span className="text-2xs text-go">Saved as a card</span>
                    ) : (
                      <button type="button" className="btn-line h-6 px-2 text-2xs" onClick={saveAnswer}>
                        Save as card
                      </button>
                    ))}
                </div>
              </>
            ) : asking ? (
              <p className="text-xs text-muted">Asking Grok…</p>
            ) : (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-xs text-muted">
                  {searching ? "No card covers this." : <>Not ready for “{askable.slice(0, 60)}”?</>}
                </p>
                <button type="button" className="btn h-7 px-2 text-xs" onClick={() => void askGrok(askable)}>
                  Ask Grok
                </button>
              </div>
            )}
            {askError && <p className="mt-1 text-2xs text-tally">{askError}</p>}
          </section>
        )}

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
                  {...cardProps}
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
                  <CueCard cue={pinnedCue} highlight open onToggle={() => setPinned(null)} {...cardProps} />
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
                <CueCard key={c.id} cue={c} open={openIds.has(c.id)} onToggle={() => toggle(c.id)} {...cardProps} />
              ))}
              {byTab[tab].length === 0 && <li className="text-sm text-muted">Nothing here yet.</li>}
            </ul>
          </>
        )}
      </main>

      {!micSupported && !tabSupported && (
        <footer className="border-t border-line px-3 py-1.5 text-2xs text-muted">
          Listening works in Chrome and Edge. You can still type to search.
        </footer>
      )}
      {source === "tab" && !listening && tabSupported && (
        <footer className="border-t border-line px-3 py-1.5 text-2xs text-muted">
          Press Listen, pick your call&apos;s tab and turn on “Share tab audio”.
        </footer>
      )}
    </div>
  );
}
