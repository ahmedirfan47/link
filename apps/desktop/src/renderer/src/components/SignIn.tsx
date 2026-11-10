import { useState } from "react";
import type { UserInfo } from "../../../shared/types";
import { ErrorNote, Spinner, Wordmark } from "./ui";

export function SignIn({ onSignedIn, serverUrl }: { onSignedIn: (user: UserInfo) => void; serverUrl: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.link.auth.signIn(email, password);
    setBusy(false);
    if (result.ok) onSignedIn(result.data);
    else setError(result.error);
  }

  return (
    <div className="flex h-full flex-col px-8 py-7">
      <Wordmark />
      <div className="my-auto">
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 mb-7 text-base text-muted">Use the account you made on the Link website.</p>
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
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" disabled={busy} className="btn w-full">
            {busy ? <Spinner /> : "Sign in"}
          </button>
        </form>
        <p className="mt-5 text-sm text-muted">
          No account yet?{" "}
          <a href={`${serverUrl}/login`} target="_blank" rel="noreferrer" className="font-semibold text-text underline underline-offset-2">
            Create one on the website
          </a>
        </p>
      </div>
    </div>
  );
}