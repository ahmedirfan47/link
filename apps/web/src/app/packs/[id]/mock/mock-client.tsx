"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, CrossIcon, MicIcon, StopIcon } from "@/components/icons";
import type { MockTurn } from "@/lib/ai";
import { mockAnswer } from "./actions";

export interface MockQuestion {
  id: string;
  prompt: string;
  bullets: string[];
  priority: number;
}

/* Browser speech recognition (Chrome, Edge); not in TypeScript's DOM types. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speechLang(language: string): string {
  if (language.startsWith("ur")) return "ur-PK";
  if (language.startsWith("ar")) return "ar-SA";
  return "en-US";
}

/** Questions per round: the hardest first (priority 1), shuffled within a priority. */
const ROUND = 6;

function pickRound(all: MockQuestion[]): MockQuestion[] {
  return [...all]
    .map((q) => ({ q, r: Math.random() }))
    .sort((a, b) => a.q.priority - b.q.priority || a.r - b.r)
    .slice(0, ROUND)
    .map(({ q }) => q);
}

interface Result {
  question: string;
  score: number;
  followUpScore: number | null;
}

type Phase = "ready" | "asking" | "answering" | "checking" | "feedback" | "done";

export function MockClient({
  packId,
  language,
  role,
  questions,
}: {
  packId: string;
  language: string;
  role: string;
  questions: MockQuestion[];
}) {
  const [round, setRound] = useState<MockQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [spoken, setSpoken] = useState(""); // what the counterpart is asking now
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [answer, setAnswer] = useState("");
  const [turn, setTurn] = useState<MockTurn | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    setRound(pickRound(questions));
    setMicSupported(recognitionCtor() !== null);
    return () => {
      recRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, [questions]);

  const q = round[index];

  function say(text: string, then: () => void) {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!voiceOn || !synth) {
      then();
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(language);
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.onend = then;
    u.onerror = then;
    synth.speak(u);
  }

  function ask(text: string, followUp: boolean) {
    setSpoken(text);
    setIsFollowUp(followUp);
    setAnswer("");
    setTurn(null);
    setError(null);
    setPhase("asking");
    say(text, () => {
      setPhase("answering");
      if (micSupported) listen();
    });
  }

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    recRef.current?.stop();
    const rec = new Ctor();
    rec.lang = speechLang(language);
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]![0].transcript;
      setAnswer(text.trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") setError(`Microphone: ${e.error}`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stopListening() {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }

  function submit() {
    if (!q || answer.trim().length < 3) return;
    stopListening();
    setPhase("checking");
    startTransition(async () => {
      const res = await mockAnswer({ packId, cueId: q.id, question: spoken, answer, followUp: isFollowUp });
      if (res.error || !res.turn) {
        setError(res.error ?? "Could not check the answer.");
        setPhase("answering");
        return;
      }
      const t = res.turn;
      setTurn(t);
      setPhase("feedback");
      setResults((rs) => {
        if (isFollowUp) {
          const copy = [...rs];
          const last = copy[copy.length - 1];
          if (last) copy[copy.length - 1] = { ...last, followUpScore: t.score };
          return copy;
        }
        return [...rs, { question: q.prompt, score: t.score, followUpScore: null }];
      });
    });
  }

  function next() {
    window.speechSynthesis?.cancel();
    if (turn && !isFollowUp && turn.followUp) {
      ask(turn.followUp, true);
      return;
    }
    const n = index + 1;
    if (n >= round.length) {
      setPhase("done");
      return;
    }
    setIndex(n);
    ask(round[n]!.prompt, false);
  }

  function restart() {
    const r = pickRound(questions);
    setRound(r);
    setIndex(0);
    setResults([]);
    ask(r[0]!.prompt, false);
  }

  /* ----------------------------- views ------------------------------ */

  if (phase === "ready") {
    return (
      <div className="max-w-[620px] border-t border-line pt-6">
        <p className="text-base text-ink-2">
          {round.length} questions, hardest first. The {role.toLowerCase()} speaks each one, then listens. Say your
          answer, press <span className="font-semibold">Done</span>, and you get a score and, if your answer was vague, a
          follow-up.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} className="h-4 w-4 accent-ink" />
          Read the questions out loud
        </label>
        {!micSupported && (
          <p className="mt-3 text-sm text-muted">Answering by voice works in Chrome and Edge. Here you can type your answers.</p>
        )}
        <button type="button" className="btn btn-lg mt-6" onClick={() => round[0] && ask(round[0].prompt, false)}>
          Start the mock call
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const scores = results.flatMap((r) => (r.followUpScore === null ? [r.score] : [r.score, r.followUpScore]));
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const verdict =
      avg >= 80 ? "Ready. Tight, specific answers." : avg >= 60 ? "Close. Sharpen the weak answers below." : "Not ready yet. Rehearse the answers below.";
    const weakest = [...results].sort((a, b) => Math.min(a.score, a.followUpScore ?? 100) - Math.min(b.score, b.followUpScore ?? 100)).slice(0, 3);
    return (
      <div className="border-t border-line pt-8">
        <p className="font-mono text-sm text-muted">Readiness</p>
        <p className="mt-2 text-4xl font-bold tracking-tight">
          {avg}
          <span className="text-lg font-semibold text-muted"> / 100</span>
        </p>
        <p className="mt-1 text-base text-ink-2">{verdict}</p>
        {weakest.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-2 text-sm font-semibold text-muted">Work on these</h3>
            <ul className="space-y-1.5">
              {weakest.map((r, i) => (
                <li key={i} className="flex gap-3 text-base">
                  <span className="w-14 shrink-0 font-mono text-sm text-muted">
                    {r.score}
                    {r.followUpScore !== null ? ` / ${r.followUpScore}` : ""}
                  </span>
                  <span dir="auto">{r.question}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="btn btn-lg mt-8" onClick={restart}>
          Another round
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[720px]">
      <div className="mb-6 flex items-center gap-4">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full bg-ink transition-[width]" style={{ width: `${(index / round.length) * 100}%` }} />
        </div>
        <span className="font-mono text-xs text-muted">
          {index + 1} / {round.length}
        </span>
      </div>

      <p className="mb-1 font-mono text-xs text-muted">
        {role}
        {isFollowUp ? " · follow-up" : ""}
        {phase === "asking" ? " · speaking…" : ""}
      </p>
      <p dir="auto" className="mb-6 text-2xl leading-tight font-bold tracking-tight text-balance">
        {spoken}
      </p>

      <textarea
        dir="auto"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={5}
        placeholder={micSupported ? "Speak your answer; it appears here. You can also type." : "Type your answer."}
        className="field text-lg"
        disabled={phase === "checking" || phase === "feedback"}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {phase === "answering" &&
          micSupported &&
          (listening ? (
            <button type="button" className="btn bg-tally hover:bg-tally" onClick={stopListening}>
              <StopIcon className="h-3.5 w-3.5" />
              Pause mic
            </button>
          ) : (
            <button type="button" className="btn-line" onClick={listen}>
              <MicIcon className="h-3.5 w-3.5" />
              Answer out loud
            </button>
          ))}
        {phase === "answering" && (
          <button type="button" className="btn" onClick={submit} disabled={answer.trim().length < 3}>
            Done
          </button>
        )}
        {phase === "checking" && <span className="text-sm text-muted">The {role.toLowerCase()} is thinking…</span>}
        {phase === "feedback" && (
          <button type="button" className="btn" onClick={next}>
            {turn && !isFollowUp && turn.followUp ? "Hear the follow-up" : index + 1 >= round.length ? "See my score" : "Next question"}
          </button>
        )}
        {phase === "asking" && (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              window.speechSynthesis?.cancel();
              setPhase("answering");
              if (micSupported) listen();
            }}
          >
            Skip reading
          </button>
        )}
      </div>

      {listening && <p className="mt-2 text-sm text-tally">Listening…</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally">
          {error}
        </p>
      )}

      {turn && phase === "feedback" && (
        <div className="mt-8 grid gap-8 border-t border-line pt-6 sm:grid-cols-2">
          <div>
            <p className="text-3xl font-bold tracking-tight">
              {turn.score}
              <span className="text-base font-semibold text-muted"> / 100</span>
            </p>
            <p dir="auto" className="mt-2 text-base text-ink-2">
              {turn.tip}
            </p>
          </div>
          <div>
            {turn.covered.map((c, i) => (
              <p key={`c${i}`} className="flex gap-2 text-sm">
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-go" />
                <span dir="auto">{c}</span>
              </p>
            ))}
            {turn.missed.map((m, i) => (
              <p key={`m${i}`} className="mt-1 flex gap-2 text-sm">
                <CrossIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tally" />
                <span dir="auto">
                  <span className="sr-only">Missed: </span>
                  {m}
                </span>
              </p>
            ))}
            {q && q.bullets.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold text-muted">Your card</p>
                {q.bullets.map((b, i) => (
                  <p key={i} dir="auto" className="text-sm font-semibold">
                    · {b}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
