import type { Metadata } from "next";
import Link from "next/link";
import { hashInviteToken, isInviteToken } from "@/lib/invites";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { AcceptInvite } from "./accept";

export const metadata: Metadata = { title: "Invite", robots: { index: false } };

/**
 * An invite to a shared pack or a team. Accepting takes a click, so link
 * previews in chat apps cannot use up the invite by just opening it.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase } = await requireUser();
  const { data: claims } = await supabase.auth.getClaims();
  const me = String(claims?.claims?.email ?? "");

  let what: { kind: "pack" | "team"; name: string; from: string | null; for: string } | null = null;
  if (isInviteToken(token)) {
    const admin = createAdminClient();
    const hash = hashInviteToken(token);
    const { data: share } = await admin
      .from("pack_shares")
      .select("email, owner_id, packs(title)")
      .eq("token_hash", hash)
      .maybeSingle();
    if (share) {
      const owner = await admin.auth.admin.getUserById(share.owner_id as string).catch(() => null);
      what = {
        kind: "pack",
        name: ((share.packs as unknown as { title: string } | null)?.title ?? "A pack") as string,
        from: owner?.data.user?.email ?? null,
        for: share.email as string,
      };
    } else {
      const { data: seat } = await admin
        .from("team_members")
        .select("email, teams(name, owner_id)")
        .eq("token_hash", hash)
        .maybeSingle();
      if (seat) {
        const team = seat.teams as unknown as { name: string; owner_id: string } | null;
        const owner = team ? await admin.auth.admin.getUserById(team.owner_id).catch(() => null) : null;
        what = { kind: "team", name: team?.name ?? "A team", from: owner?.data.user?.email ?? null, for: seat.email as string };
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-6">
      <Link href="/" className="mb-10 self-start text-lg font-bold tracking-tight">
        Link
      </Link>
      {what ? (
        <div>
          <p className="text-sm text-muted">{what.kind === "pack" ? "Shared pack" : "Team invite"}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{what.name}</h1>
          <p className="mt-2 text-base text-muted">
            {what.from ? `${what.from} invited ${what.for}` : `Invite for ${what.for}`}
            {what.kind === "pack"
              ? " to view this pack's cards, read-only, and use them in Pocket and the Chrome extension."
              : " to join the team: see its shared packs read-only and its playbook."}
          </p>
          {me && me.toLowerCase() !== what.for.toLowerCase() && (
            <p className="mt-3 rounded-md bg-marker-soft px-2.5 py-1.5 text-sm text-ink">
              You are signed in as {me}. Accept only if this invite is meant for you.
            </p>
          )}
          <AcceptInvite token={token} />
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invite not found</h1>
          <p className="mt-2 text-base text-muted">
            This link was already used or replaced with a new one. Ask the person who shared it for a new link.
          </p>
          <Link href="/packs" className="btn-line mt-6">
            Go to your packs
          </Link>
        </div>
      )}
    </main>
  );
}
