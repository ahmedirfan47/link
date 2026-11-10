"use client";

import { useActionState } from "react";
import { StateMessage, SubmitButton } from "@/components/form-status";
import { requestPasswordReset, type AuthState } from "../login/actions";

export function ForgotForm() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <StateMessage state={state} />
      <SubmitButton className="btn btn-lg w-full" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}