"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * "Build with your own AI": the user's own Claude or ChatGPT writes the cards
 * through the Link connector, on the user's own plan, instead of Link's Grok.
 */
export function OwnAiPanel({ packId, title }: { packId: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const prompt =
    `Use the Link connector to build my Link pack "${title}" (pack id ${packId}). ` +
    "Call get_writing_guide, then read_sources, write the cards exactly as the guide says, and save them with save_cards and save_gaps. " +
    "Ask me anything the material does not answer.";
  return (
    <section>
      <h2 className="mb-1 text-base font-bold">Build with your own AI</h2>
      <p className="mb-3 text-xs text-muted">
        Let your own Claude or ChatGPT write the cards on your plan. Connect Link once in{" "}
        <Link href="/settings#connector" className="underline underline-offset-2 hover:text-ink">
          Settings
        </Link>
        , then paste this in a new chat:
      </p>
      <p className="rounded-md bg-sunken px-2.5 py-2 text-xs text-ink-2">{prompt}</p>
      <button
        type="button"
        className="btn-line mt-2"
        onClick={() => void navigator.clipboard?.writeText(prompt).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy prompt"}
      </button>
    </section>
  );
}
