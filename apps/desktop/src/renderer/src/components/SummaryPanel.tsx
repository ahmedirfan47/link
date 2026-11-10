import type { LiveSnapshot } from "../live/session";
import { Logo } from "./ui";

export function SummaryPanel({ snap, onDone }: { snap: LiveSnapshot; onDone: () => void }) {
  const result = snap.result;
  const summary = result?.summary;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-ink-800 px-5 py-3">
        <Logo />
      </header>
      <main className="flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <p className="text-xs text-ink-500">Call ended</p>
          <h1 className="text-lg font-semibold">{snap.packTitle}</h1>
        </div>

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

        {summary ? (
          <>
            <section className="panel">
              <p className="label">Summary</p>
              <p className="text-sm leading-relaxed text-ink-100">{summary.summary}</p>
            </section>
            {summary.followUps.length > 0 && (
              <section className="panel">
                <p className="label">Follow-ups</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {summary.followUps.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </section>
            )}
            {summary.practice.length > 0 && (
              <section className="panel">
                <p className="label">Rehearse these next</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {summary.practice.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="panel text-sm text-ink-300">{snap.message || "No summary for this call."}</p>
        )}

        {result && result.suggestedCues > 0 && (
          <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            {result.suggestedCues} question{result.suggestedCues === 1 ? "" : "s"} you were not prepared for {result.suggestedCues === 1 ? "was" : "were"} added
            to the pack as suggested cues. Review them in the dashboard.
          </p>
        )}
      </main>
      <footer className="border-t border-ink-800 p-5">
        <button type="button" className="btn-primary w-full py-3" onClick={onDone}>
          Done
        </button>
      </footer>
    </div>
  );
}