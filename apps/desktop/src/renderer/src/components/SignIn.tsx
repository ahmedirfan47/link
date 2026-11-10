import { useState } from "react";
import type { UserInfo } from "../../../shared/types";
import { ErrorNote, Logo, Spinner } from "./ui";

export function SignIn({ onSignedIn }: { onSignedIn: (user: UserInfo) => void }) {
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
    <div className="flex h-full flex-col justify-center px-8">
      <Logo className="mb-8" />
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-ink-300">Use the same account as the Link dashboard.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">
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
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : "Sign in"}
        </button>
      </form>
    </div>
  );
}