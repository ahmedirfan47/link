import { useEffect, useState } from "react";
import type { CardKind, OverlayCard, OverlayState } from "../../../shared/types";

const KIND_STYLE: Record<CardKind, { label: string; ring: string; tag: string }> = {
  answer: { label: "Answer", ring: "border-accent/40", tag: "bg-accent/20 text-accent" },
  topic: { label: "Topic", ring: "border-sky-400/30", tag: "bg-sky-400/15 text-sky-300" },
  number: { label: "Number", ring: "border-emerald-400/40", tag: "bg-emerald-400/15 text-emerald-300" },
  recall: { label: "You were saying", ring: "border-amber-400/40", tag: "bg-amber-400/15 text-amber-300" },
  unprepared: { label: "Unprepared", ring: "border-fuchsia-400/40", tag: "bg-fuchsia-400/15 text-fuchsia-300" },
};

function Card({ card, primary, onDismiss }: { card: OverlayCard; primary: boolean; onDismiss: () => void }) {
  const style = KIND_STYLE[card.kind];
  return (
    <article
      className={`card-in no-drag rounded-2xl border ${style.ring} bg-ink-950/90 p-4 shadow-2xl backdrop-blur ${
        primary ? "" : "opacity-70"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.tag}`}>
          {style.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-500">{card.meta}</span>
          <button type="button" onClick={onDismiss} className="text-ink-500 hover:text-ink-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      </div>
      <p className={`mb-2 leading-snug text-ink-300 ${primary ? "text-sm" : "text-xs"}`}>{card.title}</p>
      <ul className="space-y-1.5">
        {card.bullets.map((b, i) => (
          <li
            key={i}
            className={`flex gap-2 font-semibold leading-snug text-white ${
              card.kind === "number" && primary ? "text-2xl" : primary ? "text-lg" : "text-sm"
            }`}
          >
            <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Overlay() {
  const [state, setState] = useState<OverlayState>({
    status: "idle",
    packTitle: "",
    cards: [],
    checklist: [],
    clickThrough: false,
  });
  const [showChecklist, setShowChecklist] = useState(false);

  useEffect(() => window.link.overlay.onState(setState), []);

  const remaining = state.checklist.filter((c) => !c.done);
  const statusColor =
    state.status === "listening" ? "bg-emerald-400" : state.status === "starting" ? "bg-amber-400" : state.status === "error" ? "bg-red-400" : "bg-ink-500";

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <header className="drag flex items-center justify-between rounded-xl border border-ink-700 bg-ink-950/85 px-3 py-1.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor} ${state.status === "listening" ? "animate-pulse" : ""}`} />
          <span className="truncate text-xs font-medium text-ink-300">{state.packTitle || "Link"}</span>
        </div>
        <div className="no-drag flex items-center gap-1">
          {state.checklist.length > 0 && (
            <button
              type="button"
              onClick={() => setShowChecklist((v) => !v)}
              className="rounded-lg px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-800"
            >
              ☑ {remaining.length}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.link.overlay.setClickThrough(!state.clickThrough)}
            className={`rounded-lg px-2 py-0.5 text-[11px] hover:bg-ink-800 ${state.clickThrough ? "text-accent" : "text-ink-300"}`}
            title="Let clicks pass through (Ctrl+Shift+K)"
          >
            ⇣
          </button>
          <button
            type="button"
            onClick={() => window.link.overlay.hide()}
            className="rounded-lg px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-800"
            title="Hide (Ctrl+Shift+L)"
          >
            —
          </button>
        </div>
      </header>

      {showChecklist && state.checklist.length > 0 && (
        <section className="no-drag rounded-xl border border-ink-700 bg-ink-950/90 p-3 text-xs backdrop-blur">
          <p className="mb-1.5 font-semibold uppercase tracking-wider text-ink-500">Before you hang up</p>
          <ul className="space-y-1">
            {state.checklist.map((c) => (
              <li key={c.id} className={c.done ? "text-ink-500 line-through" : "text-ink-100"}>
                {c.done ? "✓" : "○"} {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        {state.cards.length === 0 ? (
          state.status === "listening" && (
            <p className="px-2 pt-1 text-center text-[11px] text-ink-500 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
              Listening… cards appear here
            </p>
          )
        ) : (
          state.cards.map((card, i) => (
            <Card key={card.id} card={card} primary={i === 0} onDismiss={() => window.link.overlay.dismiss(card.id)} />
          ))
        )}
      </div>
    </div>
  );
}