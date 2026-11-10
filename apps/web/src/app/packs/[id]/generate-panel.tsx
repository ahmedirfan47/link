"use client";

import { useActionState, useEffect, useState } from "react";
import { CrossIcon, SparkIcon } from "@/components/icons";
import type { ActionState } from "@/lib/rows";
import { generateCues } from "./actions";

/**
 * Starts cue generation. The result appears as a small notice in the corner
 * so it does not push the page around.
 */
export function GenerateButton({
  packId,
  hasSources,
  hasCues,
  generating,
  large = false,
}: {
  packId: string;
  hasSources: boolean;
  hasCues: boolean;
  generating: boolean;
  large?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState>(generateCues.bind(null, packId), {});
  const [notice, setNotice] = useState<ActionState>({});

  useEffect(() => {
    if (state.error || state.message) setNotice(state);
  }, [state]);

  const busy = pending || generating;
  const label = busy ? "Writing cues…" : hasCues ? "Regenerate" : "Write cues";

  return (
    <>
      <form action={action}>
        <button
          type="submit"
          disabled={!hasSources || busy}
          className={`btn ${large ? "btn-lg" : ""}`}
          title={!hasSources ? "Add a source first" : hasCues ? "Approved cues are kept" : undefined}
          onClick={(e) => {
            if (hasCues && !window.confirm("Regenerate? Cues you approved are kept; the rest are replaced.")) {
              e.preventDefault();
            }
          }}
        >
          <SparkIcon className="h-3.5 w-3.5" />
          {label}
        </button>
      </form>
      {busy && large && <p className="mt-2 text-sm text-muted">Usually one to three minutes. You can leave this page.</p>}

      {(notice.error || notice.message) && (
        <div
          role="status"
          className={`fixed right-5 bottom-5 z-50 flex max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.18)] ${
            notice.error ? "bg-tally text-white" : "bg-ink text-white"
          }`}
        >
          <p className="flex-1">{notice.error ?? notice.message}</p>
          <button type="button" onClick={() => setNotice({})} className="opacity-70 hover:opacity-100" aria-label="Close">
            <CrossIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}