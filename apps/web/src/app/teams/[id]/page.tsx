import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmButton } from "@/components/form-status";
import { Page, PageHeader, Section } from "@/components/page";
import { ago, plural } from "@/lib/format";
import { loadPlaybook } from "@/lib/playbook";
import type { MeetingType } from "@link/core";
import { MEETING_TYPE_LABELS } from "@/lib/rows";
import { requireUser } from "@/lib/supabase/server";
import { deleteTeam, leaveTeam, removeMember } from "../actions";
import { AnswerMissesButton, InviteForm } from "../forms";

export const metadata: Metadata = { title: "Team" };
export const maxDuration = 120;

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, userId } = await requireUser();

  // RLS returns the team only to its members.
  const { data: team } = await supabase.from("teams").select("id, name, owner_id").eq("id", id).maybeSingle();
  if (!team) notFound();
  const isOwner = team.owner_id === userId;
  const [{ data: memberRows }, playbook] = await Promise.all([
    supabase.from("team_members").select("id, email, role").eq("team_id", id).order("created_at", { ascending: true }),
    loadPlaybook(id),
  ]);
  const members = memberRows ?? [];

  // Missed questions grouped by pack, so a pack owner can answer them in one go.
  const byPack = new Map<string, typeof playbook.misses>();
  for (const m of playbook.misses) byPack.set(m.packId, [...(byPack.get(m.packId) ?? []), m]);

  return (
    <Page wide>
      <PageHeader
        back={{ href: "/teams", label: "Teams" }}
        title={team.name as string}
        meta={`${plural(members.length, "member")} · ${plural(playbook.packs.length, "shared pack")} · last 90 days`}
      />

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-12">
          <Section
            title="Answers that work"
            description="Cards the team marked as helpful during calls, most helpful first."
          >
            {playbook.topCards.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing yet. During a call, press ★ on a card in Pocket or the Chrome extension when it helped.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {playbook.topCards.map((c) => (
                  <li key={c.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 py-3">
                    <span className="font-mono text-sm text-ink-2">★ {c.stars}</span>
                    <div className="min-w-0">
                      <p dir="auto" className="font-semibold">
                        {c.prompt}
                      </p>
                      {c.bullets.map((b, i) => (
                        <p key={i} dir="auto" className="text-sm text-ink-2">
                          · {b}
                        </p>
                      ))}
                      <p className="mt-0.5 text-xs text-muted">{c.packTitle}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Questions the team was not ready for"
            description="Asked on calls when no card covered them, grouped and counted. Answer the common ones first."
          >
            {playbook.misses.length === 0 ? (
              <p className="text-sm text-muted">None recorded yet.</p>
            ) : (
              <div className="space-y-8">
                {[...byPack.entries()].map(([packId, list]) => (
                  <div key={packId}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-muted">{list[0]!.packTitle}</h3>
                      {list[0]!.packOwnerId === userId && (
                        <AnswerMissesButton teamId={id} packId={packId} questions={list.map((m) => m.question)} />
                      )}
                    </div>
                    <ul className="divide-y divide-line border-y border-line">
                      {list.map((m) => (
                        <li key={m.question} className="grid grid-cols-[48px_minmax(0,1fr)_auto] gap-3 py-2.5">
                          <span className="font-mono text-sm text-tally">×{m.count}</span>
                          <span dir="auto" className="text-base">
                            {m.question}
                          </span>
                          <span className="text-xs text-muted">{ago(m.lastAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Who contributes" description="Stars, missed questions logged and calls on team packs.">
            {playbook.members.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <table className="w-full max-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-normal">Member</th>
                    <th className="py-1 text-right font-normal">Stars</th>
                    <th className="py-1 text-right font-normal">Missed</th>
                    <th className="py-1 text-right font-normal">Calls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {playbook.members.map((m) => (
                    <tr key={m.userId}>
                      <td className="py-2">{m.email}</td>
                      <td className="py-2 text-right font-mono">{m.stars}</td>
                      <td className="py-2 text-right font-mono">{m.misses}</td>
                      <td className="py-2 text-right font-mono">{m.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        <aside className="space-y-10 lg:border-l lg:border-line lg:pl-8">
          <section>
            <h2 className="mb-2 text-base font-bold">Team packs</h2>
            {playbook.packs.length === 0 ? (
              <p className="text-sm text-muted">
                Open one of your packs and choose this team under Share. Members can then use it read-only.
              </p>
            ) : (
              <ul className="space-y-1">
                {playbook.packs.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={p.ownerId === userId ? `/packs/${p.id}` : `/shared/${p.id}`}
                      className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-canvas"
                    >
                      <span className="block truncate text-sm font-semibold">{p.title}</span>
                      <span className="block text-xs text-muted">
                        {MEETING_TYPE_LABELS[p.meetingType as MeetingType] ?? p.meetingType}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold">Members</h2>
            <ul className="mb-4 space-y-0.5">
              {members.map((m) => (
                <li key={m.id} className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-canvas">
                  <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
                  {m.role === "owner" ? (
                    <span className="text-xs text-muted">owner</span>
                  ) : (
                    isOwner && (
                      <form action={removeMember.bind(null, id, m.id as string)}>
                        <ConfirmButton
                          message={`Remove ${m.email} from the team?`}
                          pendingText="…"
                          className="btn-quiet h-6 px-1 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    )
                  )}
                </li>
              ))}
            </ul>
            {isOwner && <InviteForm teamId={id} />}
          </section>

          <form action={isOwner ? deleteTeam.bind(null, id) : leaveTeam.bind(null, id)} className="border-t border-line pt-4">
            <ConfirmButton
              message={
                isOwner
                  ? "Delete this team? Packs stay with their owners and stop being shared with the team."
                  : "Leave this team?"
              }
              pendingText="…"
              className="btn-danger -ml-2"
            >
              {isOwner ? "Delete team" : "Leave team"}
            </ConfirmButton>
          </form>
        </aside>
      </div>
    </Page>
  );
}
