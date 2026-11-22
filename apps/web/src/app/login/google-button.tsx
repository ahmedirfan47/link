"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { signInWithGoogle } from "./actions";

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-4 w-4">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function Button({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-line btn-lg w-full justify-center gap-2.5">
      <GoogleMark />
      {pending ? "Opening Google…" : label}
    </button>
  );
}

/**
 * "Continue with Google": signs in, or creates the account on first use.
 * With autoStart (the desktop app's Google button opens /login?provider=google),
 * it goes straight to Google without waiting for a click.
 */
export function GoogleButton({ next, label, autoStart = false }: { next: string; label: string; autoStart?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (autoStart) form.current?.requestSubmit();
  }, [autoStart]);
  return (
    <form ref={form} action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <Button label={label} />
    </form>
  );
}
