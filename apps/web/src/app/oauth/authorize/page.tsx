import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/form-status";
import { requireUser } from "@/lib/supabase/server";
import { approve, deny } from "./actions";
import { AUTHORIZE_FIELDS, checkAuthorizeRequest, readAuthorizeParams } from "./request";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Link
        </Link>
        <div className="mt-6 rounded-lg border border-line bg-surface p-6">{children}</div>
      </div>
    </main>
  );
}

/** Which app is asking, in words a person recognises. */
function appName(clientName: string, redirectUri: string): string {
  if (clientName) return clientName;
  try {
    const host = new URL(redirectUri).hostname;
    if (host.endsWith("claude.ai") || host.endsWith("claude.com")) return "Claude";
    if (host.endsWith("chatgpt.com") || host.endsWith("openai.com")) return "ChatGPT";
    if (host === "localhost" || host === "127.0.0.1") return "An app on this computer";
    return host;
  } catch {
    return "An app";
  }
}

/**
 * The consent screen of the "Connect" flow. Signed-out visitors are sent to
 * /login first and come back here with the same request.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (typeof query.error === "string" && !query.client_id) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Could not connect</h1>
        <p className="mt-2 text-base text-muted">{query.error}</p>
      </Shell>
    );
  }

  const { supabase } = await requireUser();
  const checked = await checkAuthorizeRequest(readAuthorizeParams((k) => query[k]));
  if (checked.kind === "redirect-error") redirect(checked.url);
  if (checked.kind === "fatal") {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Could not connect</h1>
        <p className="mt-2 text-base text-muted">{checked.message}</p>
      </Shell>
    );
  }

  const { data: claims } = await supabase.auth.getClaims();
  const email = (claims?.claims?.email as string | undefined) ?? "your account";
  const name = appName(checked.client.client_name, checked.params.redirect_uri);
  const hidden = AUTHORIZE_FIELDS.map((key) => (
    <input key={key} type="hidden" name={key} value={checked.params[key]} />
  ));

  return (
    <Shell>
      <h1 className="text-xl font-bold text-balance">Allow {name} to use your Link account?</h1>
      <p className="mt-1 text-sm text-muted">Signed in as {email}</p>
      <p className="mt-5 text-sm font-semibold">{name} will be able to:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
        <li>See your packs, sources and cues</li>
        <li>Create packs and add sources and cues for you to review</li>
        <li>See the titles and summaries of your past calls</li>
      </ul>
      <p className="mt-4 text-xs text-muted">
        New cues stay unapproved until you approve them. You can disconnect at any time in Settings.
      </p>
      <div className="mt-6 flex gap-2">
        <form action={approve}>
          {hidden}
          <SubmitButton className="btn" pendingText="Connecting…">
            Allow
          </SubmitButton>
        </form>
        <form action={deny}>
          {hidden}
          <SubmitButton className="btn-line" pendingText="Cancelling…">
            Cancel
          </SubmitButton>
        </form>
      </div>
    </Shell>
  );
}