"use client";

import { useActionState } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import type { ActionState, GapRow } from "@/lib/rows";
import { answerGap, skipGap } from "./actions";

function GapItem({ packId, gap }: { packId: string; gap: GapRow }) {
  const [state, action] = useActionState<ActionState, FormData>(answerGap.bind(null, packId, gap.id), {});

  return (
    <li className="space-y-2 rounded-lg border border-zinc-200 p-3">
      <p className="text-sm font-medium">{gap.question}</p>
      <form action={action} className="space-y-2">
        <textarea name="answer" rows={2} required placeholder="Your answer, in your own words" className="input" />
        <StateMessage state={state} />
        <div className="flex gap-2">
          <SubmitButton pendingText="Saving…">Save as cue</SubmitButton>
        </div>
      </form>
      <form action={skipGap.bind(null, packId, gap.id)}>
        <SubmitButton className="btn-ghost" pendingText="…">
          Skip
        </SubmitButton>
      </form>
    </li>
  );
}

export function GapsPanel({ packId, gaps }: { packId: string; gaps: GapRow[] }) {
  if (gaps.length === 0) return null;
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold">3. Fill the gaps</h2>
        <p className="text-sm text-zinc-500">
          Your sources did not answer these, but they are likely to come up. Each answer becomes a cue.
        </p>
      </div>
      <ul className="space-y-3">
        {gaps.map((g) => (
          <GapItem key={g.id} packId={packId} gap={g} />
        ))}
      </ul>
    </section>
  );
}