import { useState } from "react";
import type { PackSummary } from "../../../shared/types";
import { CheckIcon, Wordmark } from "./ui";

const DISCLOSURE = "Quick note before we start: I use an AI assistant that takes notes during calls. Is that okay with you?";

/** Shown before every call unless turned off: a reminder to tell the other side. */
export function ConsentPanel({
  pack,
  onStart,
  onCancel,
}: {
  pack: PackSummary;
  onStart: (skipNextTime: boolean) => void;
  onCancel: () => void;
}) {
  const [skip, setSkip] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pt-4 pb-3">
        <Wordmark />
      </header>
      <main className="flex-1 overflow-y-auto px-5 pb-6">
        <p className="text-sm text-muted">Starting</p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight">{pack.title}</h1>

        <section className="mt-8">
          <h2 className="text-base font-bold">Tell them you are using Link</h2>
          <p className="mt-1.5 text-base text-text-2">
            Link transcribes what the other side says. In many places you need their agreement first, and it is the fair
            thing to do. You could say:
          </p>
          <blockquote className="mt-3 rounded-md border border-line bg-surface px-4 py-3 text-base text-text">
            {DISCLOSURE}
          </blockquote>
          <button
            type="button"
            className="btn-quiet mt-2 -ml-2"
            onClick={() => {
              void navigator.clipboard.writeText(DISCLOSURE).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied && <CheckIcon className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy to paste in the chat"}
          </button>
        </section>

        <label className="mt-8 flex items-start gap-3 text-sm text-text-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#ededea]" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          Don&apos;t show this reminder again
        </label>
      </main>
      <footer className="flex gap-2 border-t border-line px-5 pt-4 pb-5">
        <button type="button" className="btn-line h-11 flex-1" onClick={onCancel}>
          Back
        </button>
        <button type="button" className="btn h-11 flex-[2]" onClick={() => onStart(skip)}>
          I&apos;ve told them, start
        </button>
      </footer>
    </div>
  );
}