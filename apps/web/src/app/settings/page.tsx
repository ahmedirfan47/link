import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader, Section } from "@/components/page";
import { MCP_PATH } from "@/lib/oauth";
import { currentOrigin } from "@/lib/origin";
import { DESKTOP_SCHEME, installerUrl } from "@/lib/releases";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { USAGE_CAPS, capFor, todaysUsage, type UsageKind } from "@/lib/usage";
import {
  ConnectedApps,
  ConnectorPanel,
  CopyField,
  DeleteAccountForm,
  PasswordForm,
  type ConnectedApp,
  type TokenRow,
} from "./forms";

/** Apps the user approved through "Connect", one row per app. */
async function connectedApps(userId: string): Promise<ConnectedApp[]> {
  const admin = createAdminClient();
  const { data: tokens } = await admin
    .from("oauth_tokens")
    .select("client_id, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("refresh_expires_at", new Date().toISOString());
  if (!tokens || tokens.length === 0) return [];
  const ids = [...new Set(tokens.map((t) => t.client_id as string))];
  const { data: clients } = await admin.from("oauth_clients").select("client_id, client_name, redirect_uris").in("client_id", ids);

  return ids.map((id) => {
    const rows = tokens.filter((t) => t.client_id === id);
    const client = clients?.find((c) => c.client_id === id);
    const redirect = (client?.redirect_uris as string[] | undefined)?.[0] ?? "";
    const fallback = /claude\.(ai|com)/.test(redirect) ? "Claude" : /chatgpt\.com|openai\.com/.test(redirect) ? "ChatGPT" : "App";
    const used = rows.map((r) => r.last_used_at as string | null).filter((v): v is string => Boolean(v)).sort();
    return {
      clientId: id,
      name: (client?.client_name as string | undefined) || fallback,
      connectedAt: rows.map((r) => r.created_at as string).sort()[0]!,
      lastUsedAt: used[used.length - 1] ?? null,
    };
  });
}

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

  const [{ data: tokenData }, usage, apps, origin] = await Promise.all([
    supabase
      .from("api_tokens")
      .select("id, name, token_hint, created_at, last_used_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    todaysUsage(userId).catch(() => ({}) as Record<string, number>),
    connectedApps(userId).catch(() => [] as ConnectedApp[]),
    currentOrigin(),
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
          description="Connect Link to Claude or ChatGPT. They can then list your packs, read cues, create packs and add notes or cues for you to review."
        >
          <div className="max-w-[560px] space-y-3">
            <p className="text-sm font-semibold">Connector URL</p>
            <CopyField value={`${origin}${MCP_PATH}`} />
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Claude: Settings → Connectors → Add custom connector. Paste the URL above and click Connect.</li>
              <li>ChatGPT: in developer mode, create a connector with the URL above and choose OAuth.</li>
              <li>You are sent back here to sign in and click Allow. No link to copy, nothing to paste afterwards.</li>
            </ol>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Connected apps</p>
            <ConnectedApps apps={apps} />
          </div>

          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">
              For apps without sign-in support: create a private link
            </summary>
            <div className="mt-4">
              <ConnectorPanel tokens={tokens} />
              <p className="hint mt-2">Paste the private link as the server URL and choose no authentication.</p>
            </div>
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