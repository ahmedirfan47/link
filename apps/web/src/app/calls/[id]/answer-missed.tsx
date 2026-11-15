"use client";

import { useActionState } from "react";
import { StateMessage, SubmitButton } from "@/components/form-status";
import type { ActionState } from "@/lib/rows";
import { answerMissedQuestions } from "../actions";

/** One click: Grok drafts answers for the missed questions from the pack's sources. */
export function AnswerMissedButton({ callId }: { callId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(answerMissedQuestions.bind(null, callId), {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton className="btn" pendingText="Writing answers…">
        Write answers with Grok
      </SubmitButton>
      <StateMessage state={state} />
    </form>
  );
}
