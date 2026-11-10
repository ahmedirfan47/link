import { useEffect, useState } from "react";
import { HOTKEYS } from "../../../shared/config";
import type { LiveSnapshot } from "../live/session";
import { ErrorNote, LevelMeter, Logo, Spinner, formatElapsed } from "./ui";

function hotkey(label: string): string {
  return label.replace("CommandOrControl", "Ctrl");
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
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = snap.phase === "live";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
        <Logo />
        {live && (
          <span className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
            Live {snap.startedAt ? formatElapsed(now - snap.startedAt) : ""}
          </span>
        )}
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <p className="text-xs text-ink-500">Pack</p>
          <h1 className="truncate text-lg font-semibold">{snap.packTitle || "…"}</h1>
        </div>

        {snap.phase === "preparing" && (
          <div className="panel flex items-center gap-3 text-sm text-ink-300">
            <Spinner /> {snap.message}
          </div>
        )}

        {snap.phase === "error" && (
          <div className="space-y-3">
            <ErrorNote>{snap.message}</ErrorNote>
            <button type="button" className="btn-secondary" onClick={onBack}>
              Back
            </button>
          </div>
        )}

        {(live || snap.phase === "ending") && (
          <>
            <section className="panel space-y-2.5">
              {mode === "laptop" && <LevelMeter label="You" level={snap.levels.you} active={live} />}
              <LevelMeter label={mode === "laptop" ? "Them" : "Room"} level={snap.levels.them} active={live} />
              <p className="pt-1 text-[11px] text-ink-500">
                {snap.message} · {snap.matcher}
              </p>
            </section>

            <section className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Cues shown", value: snap.stats.cues },
                { label: "Unprepared", value: snap.stats.unprepared },
                { label: "Word finder", value: snap.stats.hesitations },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-ink-700 bg-ink-900 py-2">
                  <p className="text-lg font-semibold">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-ink-500">{s.label}</p>
                </div>
              ))}
            </section>

            <section className="panel">
              <p className="label">Live transcript</p>
              {snap.transcript.length === 0 ? (
                <p className="text-sm text-ink-500">Waiting for speech…</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {snap.transcript.map((line, i) => (
                    <li key={i} className={line.final ? "" : "opacity-60"}>
                      <span className={`mr-2 text-[10px] font-bold uppercase ${line.speaker === "you" ? "text-accent" : "text-emerald-400"}`}>
                        {line.speaker === "you" ? "You" : mode === "laptop" ? "Them" : "Room"}
                      </span>
                      {line.text}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {snap.checklist.length > 0 && (
              <section className="panel">
                <p className="label">Your checklist</p>
                <ul className="space-y-1 text-sm">
                  {snap.checklist.map((c) => (
                    <li key={c.id} className={c.done ? "text-ink-500 line-through" : ""}>
                      {c.done ? "✓" : "○"} {c.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="text-[11px] leading-relaxed text-ink-500">
              <p>{hotkey(HOTKEYS.toggleOverlay)} show / hide overlay</p>
              <p>{hotkey(HOTKEYS.clearCards)} clear cards</p>
              <p>{hotkey(HOTKEYS.toggleClickThrough)} let clicks pass through the overlay</p>
            </section>
          </>
        )}
      </main>

      {(live || snap.phase === "ending") && (
        <footer className="border-t border-ink-800 p-5">
          <button type="button" className="btn-stop w-full py-3 text-base" disabled={!live} onClick={onStop}>
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