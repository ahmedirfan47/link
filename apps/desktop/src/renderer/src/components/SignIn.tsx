import { useState } from "react";
import type { UserInfo } from "../../../shared/types";
import { ErrorNote, Spinner, Wordmark } from "./ui";

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-4 w-4 rounded-sm bg-white p-px">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

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

  async function browser(provider?: "google") {
    setError(null);
    const result = await window.link.auth.signInWithBrowser(provider);
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
        <p className="mt-1 mb-7 text-base text-muted">New here? Continue with Google and your account is created.</p>

        <button type="button" className="btn w-full gap-2.5" onClick={() => void browser("google")}>
          <GoogleMark />
          Continue with Google
        </button>
        <button type="button" className="btn-line mt-2 h-9 w-full" onClick={() => void browser()}>
          Sign in with email in your browser
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
          No account and no Google?{" "}
          <a href={`${serverUrl}/login?mode=signup`} target="_blank" rel="noreferrer" className="font-semibold text-text underline underline-offset-2">
            Sign up with email on the website
          </a>
        </p>
      </div>
    </div>
  );
}
