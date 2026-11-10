import { useEffect, useState } from "react";
import type { CardKind, OverlayCard, OverlayState, OverlayTextSize } from "../../../shared/types";
import { CrossIcon, ListIcon, MinusIcon, PassThroughIcon } from "./ui";

/*
 * Built like a prompter, not a chat window: one answer at a time, large
 * sentence-case text, short lines, high contrast. Older cards shrink to a
 * single line so the eye never has to choose between two answers.
 */

const KIND_LABEL: Record<CardKind, string> = {
  answer: "Answer",
  topic: "Bring up",
  number: "Number",
  recall: "You were saying",
  unprepared: "Not in your pack · drafted now",
};

const SIZE: Record<OverlayTextSize, { bullets: string; number: string; prompt: string }> = {
  s: { bullets: "text-[17px]", number: "text-[22px]", prompt: "text-xs" },
  m: { bullets: "text-[21px]", number: "text-[27px]", prompt: "text-sm" },
  l: { bullets: "text-[26px]", number: "text-[33px]", prompt: "text-base" },
};

function PrimaryCard({ card, size, onDismiss }: { card: OverlayCard; size: OverlayTextSize; onDismiss: () => void }) {
  const s = SIZE[size];
  const drafted = card.kind === "unprepared";
  return (
    <article
      className={`card-in no-drag rounded-xl bg-[#121211]/95 px-5 pt-3.5 pb-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${
        drafted ? "border border-dashed border-marker/60" : "border border-line"
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className={drafted ? "font-semibold text-marker" : "text-muted"}>{KIND_LABEL[card.kind]}</span>
        <span className="ml-auto font-mono text-2xs text-faint">{card.meta}</span>
        <button type="button" onClick={onDismiss} className="-mr-1.5 rounded-sm p-1 text-faint hover:text-text" aria-label="Dismiss card">
          <CrossIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {card.title && <p className={`mb-2.5 leading-snug text-[#a9a9a4] ${s.prompt}`}>{card.title}</p>}
      <ul className="max-w-[34ch] space-y-1.5">
        {card.bullets.map((b, i) => (
          <li
            key={i}
            className={`leading-[1.25] font-semibold text-[#f6f6f3] ${
              card.kind === "number" ? `${s.number} text-marker` : s.bullets
            }`}
          >
            {b}
          </li>
        ))}
      </ul>
    </article>
  );
}

function StubCard({ card, onDismiss }: { card: OverlayCard; onDismiss: () => void }) {
  return (
    <div className="no-drag flex items-center gap-2 rounded-lg border border-line bg-[#121211]/85 px-3 py-1.5 text-sm text-muted">
      <span className="min-w-0 flex-1 truncate">{card.title || card.bullets[0]}</span>
      <button type="button" onClick={onDismiss} className="rounded-sm p-0.5 text-faint hover:text-text" aria-label="Dismiss card">
        <CrossIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

export function Overlay() {
  const [state, setState] = useState<OverlayState>({
    status: "idle",
    packTitle: "",
    cards: [],
    checklist: [],
    clickThrough: false,
    textSize: "m",
  });
  const [showChecklist, setShowChecklist] = useState(false);

  useEffect(() => window.link.overlay.onState(setState), []);

  const remaining = state.checklist.filter((c) => !c.done);
  const dot =
    state.status === "listening"
      ? "bg-go"
      : state.status === "starting"
        ? "bg-marker"
        : state.status === "error"
          ? "bg-tally"
          : "bg-faint";
  const [primary, ...older] = state.cards;

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <header className="drag flex h-8 items-center gap-2 rounded-lg border border-line bg-[#121211]/90 pr-1 pl-3">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0 flex-1 truncate text-xs text-text-2">{state.packTitle || "Link"}</span>
        <div className="no-drag flex items-center">
          {state.checklist.length > 0 && (
            <button
              type="button"
              onClick={() => setShowChecklist((v) => !v)}
              className={`flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs hover:bg-raised ${showChecklist ? "text-text" : "text-muted"}`}
              title="Things to cover before you hang up"
            >
              <ListIcon className="h-3.5 w-3.5" />
              <span className="font-mono">{remaining.length}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => window.link.overlay.setClickThrough(!state.clickThrough)}
            className={`grid h-6 w-6 place-items-center rounded-sm hover:bg-raised ${state.clickThrough ? "text-marker" : "text-muted"}`}
            title={state.clickThrough ? "Clicks pass through (Ctrl+Shift+K to turn off)" : "Let clicks pass through (Ctrl+Shift+K)"}
            aria-pressed={state.clickThrough}
          >
            <PassThroughIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => window.link.overlay.hide()}
            className="grid h-6 w-6 place-items-center rounded-sm text-muted hover:bg-raised hover:text-text"
            title="Hide (Ctrl+Shift+L)"
          >
            <MinusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {showChecklist && state.checklist.length > 0 && (
        <section className="no-drag rounded-lg border border-line bg-[#121211]/95 px-3 py-2.5">
          <p className="mb-1.5 text-xs font-semibold text-muted">Before you hang up</p>
          <ul className="space-y-1 text-sm">
            {state.checklist.map((c) => (
              <li key={c.id} className={c.done ? "text-faint line-through" : "text-text"}>
                {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
        {primary ? (
          <>
            <PrimaryCard
              key={primary.id}
              card={primary}
              size={state.textSize}
              onDismiss={() => window.link.overlay.dismiss(primary.id)}
            />
            {older.map((card) => (
              <StubCard key={card.id} card={card} onDismiss={() => window.link.overlay.dismiss(card.id)} />
            ))}
          </>
        ) : (
          state.status === "listening" && (
            <p className="px-2 pt-1 text-center text-xs text-muted [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
              Listening. Your cue appears here when a question comes up.
            </p>
          )
        )}
      </div>
    </div>
  );
}