"use client";

import { useActionState } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import { MEETING_TYPE_LABELS, type ActionState } from "@/lib/rows";
import { createPack } from "./actions";

export function NewPackForm() {
  const [state, action] = useActionState<ActionState, FormData>(createPack, {});

  return (
    <form action={action} className="card space-y-4">
      <h2 className="text-lg font-semibold">New pack</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input id="title" name="title" required maxLength={120} placeholder="Seed round – Acme Ventures" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="meetingType">
            Meeting type
          </label>
          <select id="meetingType" name="meetingType" defaultValue="investor" className="input">
            {Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="counterpart">
            Who you are speaking with
          </label>
          <input id="counterpart" name="counterpart" maxLength={300} placeholder="Partner at a GCC seed fund, logistics focus" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="language">
            Language
          </label>
          <select id="language" name="language" defaultValue="en" className="input">
            <option value="en">English</option>
            <option value="ur-en">Urdu + English</option>
            <option value="ar-en">Arabic + English</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="goal">
          Your goal
        </label>
        <textarea id="goal" name="goal" rows={2} maxLength={1000} placeholder="Get a second meeting with the full partnership" className="input" />
      </div>
      <StateMessage state={state} />
      <SubmitButton pendingText="Creating…">Create pack</SubmitButton>
    </form>
  );
}