"use client";

import { useActionState } from "react";
import { ConfirmButton, StateMessage, SubmitButton } from "@/components/form-status";
import { InviteLinkBox, NewInviteLinkButton } from "@/components/invite-link";
import type { ActionState } from "@/lib/rows";
import { newShareLink, setPackTeam, sharePack, unsharePack } from "./actions";

export interface ShareRow {
  id: string;
  email: string;
  accepted_at: string | null;
}

export interface TeamOption {
  id: string;
  name: string;
}

/** Share the pack read-only: with a team, or with one person by invite link. */
export function SharePanel({
  packId,
  shares,
  teams,
  teamId,
}: {
  packId: string;
  shares: ShareRow[];
  teams: TeamOption[];
  teamId: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(sharePack.bind(null, packId), {});
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-base font-bold">Share</h2>
        <span className="font-mono text-xs text-muted">{shares.length}</span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Teammates can view the approved cards, use Pocket and the Chrome extension, and star cards. They cannot change
        anything.
      </p>
      {teams.length > 0 && (
        <form action={setPackTeam.bind(null, packId)} className="mb-4 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="share-team" className="field-label">
              Team
            </label>
            <select id="share-team" name="teamId" defaultValue={teamId ?? ""} className="field">
              <option value="">Not shared with a team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton className="btn-line" pendingText="…">
            Save
          </SubmitButton>
        </form>
      )}
      {shares.length > 0 && (
        <ul className="mb-3 space-y-0.5">
          {shares.map((s) => (
            <li key={s.id} className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-canvas">
              <span className="min-w-0 flex-1 truncate text-sm">
                {s.email}
                <span className="ml-1.5 text-xs text-muted">{s.accepted_at ? "joined" : "invited"}</span>
              </span>
              {!s.accepted_at && <NewInviteLinkButton create={newShareLink.bind(null, packId, s.id)} />}
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
        {state.inviteUrl && <InviteLinkBox url={state.inviteUrl} />}
        <SubmitButton className="btn-line" pendingText="Creating…">
          Create invite link
        </SubmitButton>
      </form>
    </section>
  );
}
