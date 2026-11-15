"use client";

import { useActionState } from "react";
import { StateMessage, SubmitButton } from "@/components/form-status";
import type { ActionState } from "@/lib/rows";
import { createInterviewPack } from "./actions";

export function InterviewForm() {
  const [state, action] = useActionState<ActionState, FormData>(createInterviewPack, {});
  return (
    <form action={action} className="max-w-[640px] space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="role">
            Role
          </label>
          <input id="role" name="role" required maxLength={120} placeholder="Product Analyst" className="field" autoFocus />
        </div>
        <div>
          <label className="field-label" htmlFor="company">
            Company
          </label>
          <input id="company" name="company" maxLength={120} placeholder="Careem" className="field" />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="jd">
          Job description
        </label>
        <textarea
          id="jd"
          name="jd"
          required
          rows={8}
          placeholder="Paste the whole job post: responsibilities, requirements, nice-to-haves."
          className="field"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="cvFile">
          Your CV
        </label>
        <input id="cvFile" name="cvFile" type="file" accept=".pdf,.docx,.txt,.md" className="field py-1.5" />
        <p className="hint">PDF or Word. Or paste it below instead.</p>
        <textarea id="cvText" name="cvText" rows={5} placeholder="…or paste your CV text here." className="field mt-2" aria-label="CV text" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="interviewer">
            Interviewer (optional)
          </label>
          <input id="interviewer" name="interviewer" maxLength={300} placeholder="Hiring manager, data team" className="field" />
        </div>
        <div>
          <label className="field-label" htmlFor="language">
            Language of the interview
          </label>
          <select id="language" name="language" defaultValue="en" className="field">
            <option value="en">English</option>
            <option value="ur-en">Urdu and English</option>
            <option value="ar-en">Arabic and English</option>
          </select>
        </div>
      </div>

      <StateMessage state={state} />
      <div className="border-t border-line pt-5">
        <SubmitButton className="btn btn-lg" pendingText="Reading your CV…">
          Create interview pack
        </SubmitButton>
        <p className="hint mt-2">Next, press Generate: Link writes the likely questions with answers from your CV.</p>
      </div>
    </form>
  );
}
