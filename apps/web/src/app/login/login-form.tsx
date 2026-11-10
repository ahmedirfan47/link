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
    <form action={mode === "signin" ? signInAction : signUpAction} className="card space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={mode === "signin" ? "btn" : "btn-ghost"}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={mode === "signup" ? "btn" : "btn-ghost"}
        >
          Create account
        </button>
      </div>

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          className="input"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {state.message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
      )}

      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}