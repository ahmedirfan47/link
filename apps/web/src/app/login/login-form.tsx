"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";
import { GoogleButton } from "./google-button";

export function LoginForm({
  initialError,
  next,
  initialMode = "signin",
  autoGoogle = false,
}: {
  initialError?: string;
  next: string;
  initialMode?: "signin" | "signup";
  /** Start Google sign-in straight away (from the desktop app's Google button). */
  autoGoogle?: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [signInState, signInAction, signingIn] = useActionState<
    AuthState,
    FormData
  >(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState<
    AuthState,
    FormData
  >(signUp, {});

  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;
  const error = state.error ?? (mode === "signin" ? initialError : undefined);

  return (
    <div className="space-y-5">
      <GoogleButton
        next={next}
        label={
          mode === "signin" ? "Continue with Google" : "Sign up with Google"
        }
        autoStart={autoGoogle && !initialError}
      />
      <div className="flex items-center gap-3 text-xs text-faint" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or with email
        <span className="h-px flex-1 bg-line" />
      </div>
      <form
        action={mode === "signin" ? signInAction : signUpAction}
        className="space-y-4"
      >
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="field"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            {mode === "signin" && (
              <Link
                href="/forgot"
                className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            required
            className="field"
          />
          {mode === "signup" && <p className="hint">At least 8 characters.</p>}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-tally-soft px-2.5 py-1.5 text-sm text-tally"
          >
            {error}
          </p>
        )}
        {state.message && (
          <p className="rounded-md bg-go-soft px-2.5 py-1.5 text-sm text-go">
            {state.message}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-lg w-full">
          {pending
            ? "One moment…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
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
        {mode === "signup" && (
          <p className="text-xs text-muted">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="underline underline-offset-2">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              privacy policy
            </Link>
            .
          </p>
        )}
      </form>
    </div>
  );
}
