"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {});

  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;
  const error = state.error ?? (mode === "signin" ? initialError : undefined);

  return (
    <form action={mode === "signin" ? signInAction : signUpAction} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <div>
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          className="field"
        />
        {mode === "signup" && <p className="hint">At least 8 characters.</p>}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally">
          {error}
        </p>
      )}
      {state.message && <p className="rounded-md bg-go-soft px-2.5 py-1.5 text-sm text-go">{state.message}</p>}

      <button type="submit" disabled={pending} className="btn btn-lg w-full">
        {pending ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>

      <p className="text-sm text-muted">
        {mode === "signin" ? "New to Link? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="font-semibold text-ink underline underline-offset-2"
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </form>
  );
}