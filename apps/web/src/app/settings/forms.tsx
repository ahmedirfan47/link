"use client";

import { useActionState, useState } from "react";
import { ConfirmButton, StateMessage, SubmitButton } from "@/components/form-status";
import { CheckIcon } from "@/components/icons";
import { ago } from "@/lib/format";
import type { ActionState } from "@/lib/rows";
import { createApiToken, deleteAccount, revokeApiToken, updatePassword, type TokenState } from "./actions";

export function PasswordForm({ highlight }: { highlight: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(updatePassword, {});
  return (
    <form action={action} id="password" className="max-w-[420px] space-y-3">
      {highlight && (
        <p className="rounded-md bg-marker-soft px-2.5 py-1.5 text-sm text-ink">
          You are signed in from your reset link. Choose a new password.
        </p>
      )}
      <div>
        <label className="field-label" htmlFor="password">
          New password
        </label>
        <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required className="field" />
      </div>
      <div>
        <label className="field-label" htmlFor="confirm">
          Type it again
        </label>
        <input id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required className="field" />
      </div>
      <StateMessage state={state} />
      <SubmitButton className="btn-line" pendingText="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}

export interface TokenRow {
  id: string;
  name: string;
  token_hint: string;
  created_at: string;
  last_used_at: string | null;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="field font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : null}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ConnectorPanel({ tokens }: { tokens: TokenRow[] }) {
  const [state, action] = useActionState<TokenState, FormData>(createApiToken, {});
  return (
    <div className="space-y-5">
      {state.url && (
        <div className="space-y-2 rounded-lg bg-canvas p-4">
          <p className="text-sm font-semibold">Your connector link</p>
          <CopyField value={state.url} />
          <p className="text-xs text-muted">
            It works like a password: anyone with it can read and add to your packs. Copy it now; it is not shown again.
          </p>
        </div>
      )}
      <form action={action} className="flex max-w-[480px] items-end gap-2">
        <div className="flex-1">
          <label className="field-label" htmlFor="token-name">
            Name it after where you will use it
          </label>
          <input id="token-name" name="name" maxLength={80} placeholder="Claude" className="field" />
        </div>
        <SubmitButton className="btn-line" pendingText="Creating…">
          Create link
        </SubmitButton>
      </form>
      {state.error && <StateMessage state={state} />}

      {tokens.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.name || "Connector"}</p>
                <p className="text-xs text-muted">
                  Ends in <span className="font-mono">{t.token_hint}</span> · created {ago(t.created_at)} ·{" "}
                  {t.last_used_at ? `last used ${ago(t.last_used_at)}` : "never used"}
                </p>
              </div>
              <form action={revokeApiToken.bind(null, t.id)}>
                <ConfirmButton message="Revoke this link? Anything using it stops working." pendingText="Revoking…">
                  Revoke
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(deleteAccount, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-danger -ml-2" onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  }
  return (
    <form action={action} className="max-w-[420px] space-y-3 rounded-lg border border-tally/40 p-4">
      <p className="text-sm text-ink-2">
        This permanently deletes your packs, uploaded files, calls and your account. It cannot be undone. Download your
        data first if you want a copy.
      </p>
      <div>
        <label className="field-label" htmlFor="confirm-email">
          Type <span className="font-mono">{email}</span> to confirm
        </label>
        <input id="confirm-email" name="confirm" autoComplete="off" className="field" />
      </div>
      <StateMessage state={state} />
      <div className="flex gap-1">
        <SubmitButton className="btn bg-tally hover:bg-tally" pendingText="Deleting…">
          Delete everything
        </SubmitButton>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}