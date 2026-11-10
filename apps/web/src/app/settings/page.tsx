import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader, Section } from "@/components/page";
import { DESKTOP_SCHEME, installerUrl } from "@/lib/releases";
import { requireUser } from "@/lib/supabase/server";
import { USAGE_CAPS, capFor, todaysUsage, type UsageKind } from "@/lib/usage";
import { ConnectorPanel, DeleteAccountForm, PasswordForm, type TokenRow } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reset } = await searchParams;
  const { supabase, userId } = await requireUser();
  const { data: claims } = await supabase.auth.getClaims();
  const email = String(claims?.claims?.email ?? "");

  const [{ data: tokenData }, usage] = await Promise.all([
    supabase
      .from("api_tokens")
      .select("id, name, token_hint, created_at, last_used_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    todaysUsage(userId).catch(() => ({}) as Record<string, number>),
  ]);
  const tokens = (tokenData ?? []) as TokenRow[];
  const used = (Object.keys(USAGE_CAPS) as UsageKind[]).filter((k) => (usage[k] ?? 0) > 0);

  return (
    <Page>
      <PageHeader title="Settings" meta={email} />

      <div className="space-y-14">
        <Section title="Password">
          <PasswordForm highlight={reset === "1"} />
        </Section>

        <Section
          title="Desktop app"
          description="Live calls run in the Windows app. It signs in with this account through your browser."
        >
          <div className="flex flex-wrap gap-2">
            <a href={installerUrl()} className="btn-line">
              Download for Windows
            </a>
            <a href={`${DESKTOP_SCHEME}://open`} className="btn-quiet">
              Open the app
            </a>
          </div>
        </Section>

        <Section
          title="Claude and ChatGPT connector"
          description="Create a link and add it as a custom connector in Claude or ChatGPT. They can then list your packs, read cues, create packs and add notes or cues for you to review."
        >
          <ConnectorPanel tokens={tokens} />
          <details className="mt-4 text-sm text-muted">
            <summary className="cursor-pointer hover:text-ink">How to add it</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Claude: Settings → Connectors → Add custom connector. Paste the link as the server URL.</li>
              <li>ChatGPT: turn on developer mode in the connector settings, create a custom connector, paste the link and choose no authentication.</li>
              <li>Then ask, for example: “Add my notes from this chat to my Northgate pack in Link.”</li>
            </ol>
          </details>
        </Section>

        <Section title="Today’s usage" description="Limits reset at midnight UTC.">
          {used.length === 0 ? (
            <p className="text-sm text-muted">Nothing used yet today.</p>
          ) : (
            <ul className="max-w-[480px] divide-y divide-line">
              {used.map((k) => (
                <li key={k} className="flex justify-between py-2 text-sm">
                  <span className="text-ink-2 first-letter:uppercase">{USAGE_CAPS[k].label}</span>
                  <span className="font-mono text-xs text-muted">
                    {usage[k]} / {capFor(k)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Your data">
          <div className="space-y-6">
            <div>
              <a href="/api/export" className="btn-line">
                Download all my data
              </a>
              <p className="hint">One JSON file with your packs, sources, cues and calls.</p>
            </div>
            <DeleteAccountForm email={email} />
          </div>
        </Section>

        <p className="text-sm text-muted">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>
        </p>
      </div>
    </Page>
  );
}