"use client";

import { useActionState } from "react";
import { SubmitButton, StateMessage } from "@/components/form-status";
import { MEETING_TYPE_LABELS, type ActionState } from "@/lib/rows";
import { createPack } from "./actions";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ur-en", label: "Urdu and English" },
  { value: "ar-en", label: "Arabic and English" },
];

export function NewPackForm() {
  const [state, action] = useActionState<ActionState, FormData>(createPack, {});

  return (
    <form action={action} className="max-w-[560px] space-y-6">
      <div>
        <label className="field-label" htmlFor="title">
          Name
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          autoFocus
          placeholder="Seed round, Northgate Capital"
          className="field"
        />
      </div>

      <fieldset>
        <legend className="field-label">What kind of conversation</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="meetingType"
                value={value}
                defaultChecked={value === "investor"}
                className="peer sr-only"
              />
              <span className="inline-flex h-8 items-center rounded-md border border-line-strong px-3 text-sm text-ink-2 transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink hover:border-ink-2">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="field-label" htmlFor="counterpart">
          Who you are speaking with
        </label>
        <input
          id="counterpart"
          name="counterpart"
          maxLength={300}
          placeholder="Partner at a seed fund, invests in logistics"
          className="field"
        />
        <p className="hint">A role and a line of context is enough. Link uses it to guess what they will ask.</p>
      </div>

      <div>
        <label className="field-label" htmlFor="goal">
          What you want from the call
        </label>
        <textarea
          id="goal"
          name="goal"
          rows={2}
          maxLength={1000}
          placeholder="A second meeting with the full partnership"
          className="field"
        />
      </div>

      <div className="max-w-[260px]">
        <label className="field-label" htmlFor="language">
          Language of the call
        </label>
        <select id="language" name="language" defaultValue="en" className="field">
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <StateMessage state={state} />
      <div className="border-t border-line pt-5">
        <SubmitButton className="btn btn-lg" pendingText="Creating…">
          Create pack
        </SubmitButton>
      </div>
    </form>
  );
}