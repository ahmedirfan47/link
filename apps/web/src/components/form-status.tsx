"use client";

import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/rows";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "btn",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Submit button that asks for confirmation first (for destructive actions). */
export function ConfirmButton({
  children,
  message,
  pendingText = "Working…",
  className = "btn-danger",
}: {
  children: React.ReactNode;
  message: string;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function StateMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return <p className="rounded-md bg-go-soft px-2.5 py-1.5 text-sm text-go">{state.message}</p>;
  }
  return null;
}