"use client";

import { useActionState } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import { Section } from "@/components/page";
import type { ActionState, GapRow } from "@/lib/rows";
import { answerGap, skipGap } from "./actions";

function GapItem({ packId, gap, index }: { packId: string; gap: GapRow; index: number }) {
  const [state, action] = useActionState<ActionState, FormData>(answerGap.bind(null, packId, gap.id), {});

  return (
    <li className="grid grid-cols-[24px_1fr] gap-x-2 py-4">
      <span className="pt-0.5 font-mono text-xs text-faint">{String(index + 1).padStart(2, "0")}</span>
      <div className="space-y-2">
        <p className="font-semibold">{gap.question}</p>
        <form action={action} className="space-y-2">
          <textarea
            name="answer"
            rows={2}
            required
            placeholder="Answer the way you would say it. Link shortens it into a cue."
            className="field"
          />
          <StateMessage state={state} />
          <div className="flex items-center gap-1">
            <SubmitButton className="btn-line" pendingText="Saving…">
              Save answer
            </SubmitButton>
            <button formAction={skipGap.bind(null, packId, gap.id)} formNoValidate className="btn-quiet">
              Skip
            </button>
          </div>
        </form>
      </div>
    </li>
  );
}

export function GapsPanel({ packId, gaps }: { packId: string; gaps: GapRow[] }) {
  return (
    <Section
      title="Questions only you can answer"
      description="Your sources do not cover these, but they are likely to come up. Each answer becomes an approved cue."
    >
      <ol className="divide-y divide-line">
        {gaps.map((g, i) => (
          <GapItem key={g.id} packId={packId} gap={g} index={i} />
        ))}
      </ol>
    </Section>
  );
}