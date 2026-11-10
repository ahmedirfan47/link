"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, CrossIcon, MicIcon, StopIcon } from "@/components/icons";
import type { Grade } from "@/lib/ai";
import { gradeRehearsal } from "./actions";

export interface RehearsalCue {
  id: string;
  prompt: string;
  bullets: string[];
  priority: number;
}

/* Minimal typing for the browser Speech Recognition API (Chrome / Edge). */
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speechLang(language: string): string {
  if (language.startsWith("ur")) return "ur-PK";
  if (language.startsWith("ar")) return "ar-SA";
  return "en-US";
}

/** Priority-1 cues come first, then a shuffle within each priority. */
function orderCues(cues: RehearsalCue[]): RehearsalCue[] {
  return [...cues]
    .map((c) => ({ c, r: Math.random() }))
    .sort((a, b) => a.c.priority - b.c.priority || a.r - b.r)
    .map(({ c }) => c);
}

export function RehearseClient({
  packId,
  language,
  cues,
}: {
  packId: string;
  language: string;
  cues: RehearsalCue[];
}) {
  const [deck, setDeck] = useState<RehearsalCue[]>(cues);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pending, startTransition] = useTransition();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setDeck(orderCues(cues));
    setSpeechSupported(getSpeechRecognition() !== null);
  }, [cues]);

  const cue = deck[index];
  const finished = index >= deck.length;

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function startListening() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = speechLang(language);
    recognition.continuous = true;
    recognition.interimResults = true;
    const base = answer ? `${answer.trim()} ` : "";
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i]![0].transcript;
      setAnswer(base + text.trim());
    };
    recognition.onerror = (e) => {
      if (e.error !== "aborted") setError(`Microphone: ${e.error}`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    recognition.start();
    setListening(true);
  }

  function submit() {
    if (!cue) return;
    stopListening();
    setError(null);
    startTransition(async () => {
      const result = await gradeRehearsal(packId, cue.id, answer);
      if (result.error) setError(result.error);
      if (result.grade) {
        setGrade(result.grade);
        setRevealed(true);
        setScores((s) => [...s, result.grade!.score]);
      }
    });
  }

  function next() {
    stopListening();
    setAnswer("");
    setGrade(null);
    setError(null);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  function restart() {
    setDeck(orderCues(cues));
    setIndex(0);
    setScores([]);
    setAnswer("");
    setGrade(null);
    setRevealed(false);
  }

  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  if (finished) {
    return (
      <div className="border-t border-line pt-8">
        <p className="font-mono text-sm text-muted">Round complete</p>
        <p className="mt-2 text-3xl font-bold tracking-tight">
          {average !== null ? (
            <>
              {average}
              <span className="text-lg font-semibold text-muted"> / 100 average</span>
            </>
          ) : (
            "No answers graded"
          )}
        </p>
        <p className="mt-1 text-base text-muted">
          {scores.length} of {deck.length} questions answered and checked.
        </p>
        <button type="button" className="btn btn-lg mt-6" onClick={restart}>
          Go again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full bg-ink transition-[width]" style={{ width: `${(index / deck.length) * 100}%` }} />
        </div>
        <span className="font-mono text-xs text-muted">
          {index + 1} / {deck.length}
        </span>
        {average !== null && <span className="font-mono text-xs text-muted">avg {average}</span>}
      </div>

      <p className="mb-6 text-2xl leading-tight font-bold tracking-tight text-balance">{cue?.prompt}</p>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={5}
        placeholder={speechSupported ? "Press Answer out loud and speak, or type here." : "Type your answer."}
        className="field text-lg"
        disabled={pending}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {speechSupported &&
          (listening ? (
            <button type="button" className="btn bg-tally hover:bg-tally" onClick={stopListening}>
              <StopIcon className="h-3.5 w-3.5" />
              Stop
            </button>
          ) : (
            <button type="button" className="btn-line" onClick={startListening} disabled={pending}>
              <MicIcon className="h-3.5 w-3.5" />
              Answer out loud
            </button>
          ))}
        <button type="button" className="btn" onClick={submit} disabled={pending || answer.trim().length < 3}>
          {pending ? "Checking…" : "Check my answer"}
        </button>
        <span className="flex-1" />
        {!revealed && (
          <button type="button" className="btn-quiet" onClick={() => setRevealed(true)}>
            Show my cue
          </button>
        )}
        <button type="button" className="btn-quiet" onClick={next}>
          {grade || revealed ? "Next question" : "Skip"}
        </button>
      </div>

      {listening && <p className="mt-2 text-sm text-tally">Listening…</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally">
          {error}
        </p>
      )}

      {(revealed || grade) && (
        <div className="mt-10 grid gap-10 border-t border-line pt-6 sm:grid-cols-2">
          {revealed && cue && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">Your cue</h3>
              {cue.bullets.length > 0 ? (
                <ul className="space-y-1.5">
                  {cue.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2.5 text-base font-semibold">
                      <span className="mt-[0.6em] h-1 w-1 shrink-0 bg-ink-2" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-faint">This cue has no answer yet.</p>
              )}
            </div>
          )}

          {grade && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">How you did</h3>
              <p className="text-3xl font-bold tracking-tight">
                {grade.score}
                <span className="text-base font-semibold text-muted"> / 100</span>
              </p>
              <p className="mt-2 text-base text-ink-2">{grade.tip}</p>
              {grade.covered.length > 0 && (
                <ul className="mt-4 space-y-1">
                  {grade.covered.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-go" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {grade.missed.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {grade.missed.map((m, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <CrossIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tally" />
                      <span>
                        <span className="sr-only">Missed: </span>
                        {m}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}