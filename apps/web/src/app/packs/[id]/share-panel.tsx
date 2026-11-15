"use client";

import { useActionState } from "react";
import { ConfirmButton, StateMessage, SubmitButton } from "@/components/form-status";
import type { ActionState } from "@/lib/rows";
import { sharePack, unsharePack } from "./actions";

export interface ShareRow {
  id: string;
  email: string;
}

/** Share the pack read-only with teammates by email. */
export function SharePanel({ packId, shares }: { packId: string; shares: ShareRow[] }) {
  const [state, action] = useActionState<ActionState, FormData>(sharePack.bind(null, packId), {});
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-base font-bold">Share</h2>
        <span className="font-mono text-xs text-muted">{shares.length}</span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Teammates can view the approved cards and use Pocket. They cannot change anything.
      </p>
      {shares.length > 0 && (
        <ul className="mb-3 space-y-0.5">
          {shares.map((s) => (
            <li key={s.id} className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-canvas">
              <span className="min-w-0 flex-1 truncate text-sm">{s.email}</span>
              <form action={unsharePack.bind(null, packId, s.id)}>
                <ConfirmButton
                  message={`Stop sharing with ${s.email}?`}
                  pendingText="…"
                  className="btn-quiet h-6 px-1 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  Remove
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="space-y-2">
        <label htmlFor="share-email" className="sr-only">
          Teammate email
        </label>
        <input id="share-email" name="email" type="email" required placeholder="teammate@company.com" className="field" />
        <StateMessage state={state} />
        <SubmitButton className="btn-line" pendingText="Sharing…">
          Share read-only
        </SubmitButton>
      </form>
    </section>
  );
}
