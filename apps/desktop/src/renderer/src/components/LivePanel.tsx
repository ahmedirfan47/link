import { useEffect, useRef, useState } from "react";
import { HOTKEYS } from "../../../shared/config";
import type { LiveSnapshot } from "../live/session";
import { CheckIcon, ErrorNote, LevelMeter, Spinner, Wordmark, formatElapsed } from "./ui";

function keys(accelerator: string): string[] {
  return accelerator.replace("CommandOrControl", "Ctrl").split("+");
}

function Hotkey({ accelerator, label }: { accelerator: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="flex gap-1">
        {keys(accelerator).map((k) => (
          <kbd key={k} className="kbd">
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}

export function LivePanel({
  snap,
  mode,
  onStop,
  onBack,
}: {
  snap: LiveSnapshot;
  mode: "laptop" | "room";
  onStop: () => void;
  onBack: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "end" });
  }, [snap.transcript.length]);

  const live = snap.phase === "live";
  const running = live || snap.phase === "ending";
  const other = mode === "laptop" ? "Them" : "Room";

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <Wordmark live={live} />
          {running && snap.startedAt && (
            <span className="font-mono text-xl text-text tabular-nums">{formatElapsed(now - snap.startedAt)}</span>
          )}
        </div>
        <p className="mt-2 truncate text-sm text-muted">{snap.packTitle || "Loading pack"}</p>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto px-5 pb-6">
        {snap.phase === "preparing" && (
          <p className="flex items-center gap-2.5 pt-4 text-base text-text-2">
            <Spinner /> {snap.message}
          </p>
        )}

        {snap.phase === "error" && (
          <div className="space-y-3 pt-4">
            <ErrorNote>{snap.message}</ErrorNote>
            <button type="button" className="btn-line" onClick={onBack}>
              Back
            </button>
          </div>
        )}

        {running && (
          <>
            <section className="space-y-2 border-t border-line pt-4">
              {mode === "laptop" && <LevelMeter label="You" level={snap.levels.you} active={live} />}
              <LevelMeter label={other} level={snap.levels.them} active={live} />
              <p className="pt-1 text-xs text-muted">
                {snap.message}
                {snap.matcher ? ` · ${snap.matcher}` : ""}
              </p>
            </section>

            <p className="font-mono text-xs text-text-2">
              {snap.stats.cues} cues shown · {snap.stats.unprepared} not prepared · {snap.stats.hesitations} word finder
            </p>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">Transcript</h2>
              {snap.transcript.length === 0 ? (
                <p className="text-sm text-faint">Nothing heard yet. Lines appear here as people speak.</p>
              ) : (
                <ul className="space-y-2 text-base">
                  {snap.transcript.map((line, i) => (
                    <li key={i} className={`grid grid-cols-[42px_1fr] gap-2 ${line.final ? "" : "opacity-55"}`}>
                      <span className={`pt-0.5 text-xs font-semibold ${line.speaker === "you" ? "text-text-2" : "text-go"}`}>
                        {line.speaker === "you" ? "You" : other}
                      </span>
                      <span className="text-text-2">{line.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div ref={transcriptEnd} />
            </section>

            {snap.checklist.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-muted">Before you hang up</h2>
                <ul className="space-y-1.5 text-base">
                  {snap.checklist.map((c) => (
                    <li key={c.id} className={`flex gap-2 ${c.done ? "text-faint line-through" : "text-text-2"}`}>
                      <span
                        className={`mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border ${
                          c.done ? "border-go bg-go text-bg" : "border-faint"
                        }`}
                      >
                        {c.done && <CheckIcon className="h-2.5 w-2.5" />}
                      </span>
                      {c.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-t border-line pt-4">
              <ul className="space-y-1.5 text-sm text-muted">
                <Hotkey accelerator={HOTKEYS.toggleOverlay} label="Show or hide the overlay" />
                <Hotkey accelerator={HOTKEYS.clearCards} label="Clear cards" />
                <Hotkey accelerator={HOTKEYS.toggleClickThrough} label="Let clicks pass through" />
              </ul>
            </section>
          </>
        )}
      </main>

      {running && (
        <footer className="border-t border-line px-5 pt-4 pb-5">
          <button type="button" className="btn-end w-full" disabled={!live} onClick={onStop}>
            {snap.phase === "ending" ? (
              <>
                <Spinner /> {snap.message}
              </>
            ) : (
              "End call"
            )}
          </button>
        </footer>
      )}
    </div>
  );
}