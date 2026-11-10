"use client";

import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/rows";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "btn",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
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
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  }
  if (state.message) {
    return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>;
  }
  return null;
}