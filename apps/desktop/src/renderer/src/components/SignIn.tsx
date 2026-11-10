import { useState } from "react";
import type { UserInfo } from "../../../shared/types";
import { ErrorNote, Spinner, Wordmark } from "./ui";

export function SignIn({
  onSignedIn,
  serverUrl,
  authError,
}: {
  onSignedIn: (user: UserInfo) => void;
  serverUrl: string;
  /** Error from a browser sign-in that came back through a link-app:// link. */
  authError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function browser() {
    setError(null);
    const result = await window.link.auth.signInWithBrowser();
    if (result.ok) setWaiting(true);
    else setError(result.error);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.link.auth.signIn(email, password);
    setBusy(false);
    if (result.ok) onSignedIn(result.data);
    else setError(result.error);
  }

  const shownError = error ?? authError;

  return (
    <div className="flex h-full flex-col px-8 py-7">
      <Wordmark />
      <div className="my-auto">
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 mb-7 text-base text-muted">Use your Link website account.</p>

        <button type="button" className="btn w-full" onClick={() => void browser()}>
          Sign in with your browser
        </button>
        {waiting && !shownError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-text-2">
            <Spinner /> Finish in your browser, then allow it to open Link.
          </p>
        )}

        {shownError && (
          <div className="mt-4">
            <ErrorNote>{shownError}</ErrorNote>
          </div>
        )}

        <div className="mt-8 border-t border-line pt-5">
          {showPassword ? (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="field-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                />
              </div>
              <button type="submit" disabled={busy} className="btn-line h-9 w-full">
                {busy ? <Spinner /> : "Sign in with password"}
              </button>
            </form>
          ) : (
            <button type="button" className="text-sm text-muted hover:text-text" onClick={() => setShowPassword(true)}>
              Use email and password instead
            </button>
          )}
        </div>

        <p className="mt-6 text-sm text-muted">
          No account yet?{" "}
          <a href={`${serverUrl}/login?mode=signup`} target="_blank" rel="noreferrer" className="font-semibold text-text underline underline-offset-2">
            Create one on the website
          </a>
        </p>
      </div>
    </div>
  );
}