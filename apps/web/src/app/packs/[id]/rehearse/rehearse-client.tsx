"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
      <div className="card space-y-3 text-center">
        <h2 className="text-xl font-semibold">Round complete</h2>
        <p className="text-zinc-600">
          {scores.length} answers graded{average !== null ? ` · average score ${average}` : ""}.
        </p>
        <button type="button" className="btn" onClick={restart}>
          Go again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          Question {index + 1} of {deck.length}
        </span>
        {average !== null && <span>Average score {average}</span>}
      </div>

      <div className="card space-y-4">
        <p className="text-xl font-semibold leading-snug">{cue?.prompt}</p>

        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={5}
          placeholder={speechSupported ? "Answer out loud with the mic, or type…" : "Type your answer…"}
          className="input"
          disabled={pending}
        />

        <div className="flex flex-wrap gap-2">
          {speechSupported &&
            (listening ? (
              <button type="button" className="btn-danger" onClick={stopListening}>
                ■ Stop mic
              </button>
            ) : (
              <button type="button" className="btn-ghost" onClick={startListening} disabled={pending}>
                🎙 Answer out loud
              </button>
            ))}
          <button type="button" className="btn" onClick={submit} disabled={pending || answer.trim().length < 3}>
            {pending ? "Grading…" : "Check my answer"}
          </button>
          {!revealed && (
            <button type="button" className="btn-ghost" onClick={() => setRevealed(true)}>
              Show cue
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={next}>
            {grade || revealed ? "Next question →" : "Skip"}
          </button>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      {revealed && cue && (
        <div className="card space-y-2">
          <h3 className="label">Your cue</h3>
          {cue.bullets.length > 0 ? (
            <ul className="list-disc pl-5">
              {cue.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">This cue has no answer bullets yet.</p>
          )}
        </div>
      )}

      {grade && (
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white ${
                grade.score >= 75 ? "bg-emerald-600" : grade.score >= 50 ? "bg-amber-500" : "bg-red-600"
              }`}
            >
              {grade.score}
            </span>
            <p className="text-sm text-zinc-700">{grade.tip}</p>
          </div>
          {grade.covered.length > 0 && (
            <div>
              <h3 className="label">You covered</h3>
              <ul className="list-disc pl-5 text-sm">
                {grade.covered.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {grade.missed.length > 0 && (
            <div>
              <h3 className="label">You missed</h3>
              <ul className="list-disc pl-5 text-sm text-red-700">
                {grade.missed.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}