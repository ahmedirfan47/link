"use client";

import { useActionState } from "react";
import { StateMessage } from "@/components/form-status";
import type { ActionState } from "@/lib/rows";
import { generateCues } from "./actions";

export function GeneratePanel({
  packId,
  hasSources,
  hasCues,
}: {
  packId: string;
  hasSources: boolean;
  hasCues: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState>(generateCues.bind(null, packId), {});

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold">2. Generate cues</h2>
        <p className="text-sm text-zinc-500">
          Claude reads your sources and writes the questions you will likely get, short answer cues, key
          numbers, and the points you want to make. Cues you have approved are kept when you regenerate.
        </p>
      </div>
      <form action={action}>
        <button type="submit" disabled={!hasSources || pending} className="btn">
          {pending ? "Generating… (1–3 minutes)" : hasCues ? "Regenerate cues" : "Generate cues"}
        </button>
      </form>
      {!hasSources && <p className="text-sm text-zinc-500">Add a source first.</p>}
      <StateMessage state={state} />
    </section>
  );
}