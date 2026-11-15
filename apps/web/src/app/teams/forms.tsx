"use client";

import { useActionState } from "react";
import { StateMessage, SubmitButton } from "@/components/form-status";
import type { ActionState } from "@/lib/rows";
import { answerTeamMisses, createTeam, inviteMember } from "./actions";

export function CreateTeamForm() {
  const [state, action] = useActionState<ActionState, FormData>(createTeam, {});
  return (
    <form action={action} className="space-y-3">
      <label className="sr-only" htmlFor="team-name">
        Team name
      </label>
      <input id="team-name" name="name" required maxLength={80} placeholder="Sales team" className="field" />
      <StateMessage state={state} />
      <SubmitButton className="btn" pendingText="Creating…">
        Create team
      </SubmitButton>
    </form>
  );
}

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(inviteMember.bind(null, teamId), {});
  return (
    <form action={action} className="space-y-2">
      <label className="field-label" htmlFor="invite-emails">
        Add members
      </label>
      <input
        id="invite-emails"
        name="emails"
        required
        placeholder="sara@company.com, omar@company.com"
        className="field"
        autoComplete="off"
      />
      <StateMessage state={state} />
      <SubmitButton className="btn-line" pendingText="Adding…">
        Add
      </SubmitButton>
    </form>
  );
}

export function AnswerMissesButton({ teamId, packId, questions }: { teamId: string; packId: string; questions: string[] }) {
  const [state, action] = useActionState<ActionState, FormData>(
    answerTeamMisses.bind(null, teamId, packId, questions),
    {},
  );
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <SubmitButton className="btn-line h-7 px-2 text-xs" pendingText="Writing…">
        Write answers with Grok
      </SubmitButton>
      <StateMessage state={state} />
    </form>
  );
}
