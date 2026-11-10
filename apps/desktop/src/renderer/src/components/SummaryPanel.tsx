import type { LiveSnapshot } from "../live/session";
import { ExternalIcon, Wordmark } from "./ui";

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-base text-text-2">
          <span className="mt-[0.6em] h-1 w-1 shrink-0 bg-muted" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

export function SummaryPanel({
  snap,
  serverUrl,
  onDone,
}: {
  snap: LiveSnapshot;
  serverUrl: string;
  onDone: () => void;
}) {
  const result = snap.result;
  const summary = result?.summary;

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pt-4 pb-3">
        <Wordmark />
      </header>
      <main className="flex-1 space-y-7 overflow-y-auto px-5 pb-6">
        <div>
          <p className="text-sm text-muted">Call ended</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight">{snap.packTitle}</h1>
          <p className="mt-2 font-mono text-xs text-text-2">
            {snap.stats.cues} cues shown · {snap.stats.unprepared} not prepared · {snap.stats.hesitations} word finder
          </p>
        </div>

        {result && result.suggestedCues > 0 && (
          <p className="rounded-md bg-marker px-3 py-2 text-sm font-semibold text-bg">
            {result.suggestedCues} question{result.suggestedCues === 1 ? "" : "s"} you were not ready for{" "}
            {result.suggestedCues === 1 ? "was" : "were"} added to the pack. Answer{" "}
            {result.suggestedCues === 1 ? "it" : "them"} on the website before your next call.
          </p>
        )}

        {summary ? (
          <>
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">Summary</h2>
              <p className="text-base leading-relaxed text-text-2">{summary.summary}</p>
            </section>
            {summary.followUps.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-muted">Follow up</h2>
                <Bullets items={summary.followUps} />
              </section>
            )}
            {summary.practice.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-muted">Rehearse before next time</h2>
                <Bullets items={summary.practice} />
              </section>
            )}
          </>
        ) : (
          <p className="text-base text-muted">{snap.message || "No summary for this call."}</p>
        )}
      </main>
      <footer className="flex gap-2 border-t border-line px-5 pt-4 pb-5">
        {snap.sessionId && (
          <a href={`${serverUrl}/calls/${snap.sessionId}`} target="_blank" rel="noreferrer" className="btn-line h-10 flex-1">
            Open on the website
            <ExternalIcon className="h-3.5 w-3.5" />
          </a>
        )}
        <button type="button" className="btn h-10 flex-1" onClick={onDone}>
          Done
        </button>
      </footer>
    </div>
  );
}