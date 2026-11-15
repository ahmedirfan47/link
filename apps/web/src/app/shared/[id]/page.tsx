import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { plural } from "@/lib/format";
import { loadPackForViewer } from "@/lib/pack-access";
import { MEETING_TYPE_LABELS, type CueRow } from "@/lib/rows";
import { createAdminClient } from "@/lib/supabase/admin";
import { PocketButton } from "../../packs/[id]/pocket-button";

export const metadata: Metadata = { title: "Shared pack", robots: { index: false } };

const SECTIONS: { title: string; match: (c: CueRow) => boolean }[] = [
  { title: "Questions you may get", match: (c) => c.direction === "incoming" && c.kind !== "number" },
  { title: "Numbers to have ready", match: (c) => c.kind === "number" },
  { title: "Points to make", match: (c) => c.direction === "outgoing" && c.kind !== "number" },
];

/** A pack a teammate shared with you: approved cards only, read-only, with Pocket. */
export default async function SharedPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const access = await loadPackForViewer(id);
  if (!access) notFound();
  if (access.role === "owner") redirect(`/packs/${id}`);
  const { pack } = access;

  const [{ data: cueData }, owner] = await Promise.all([
    access.db
      .from("cues")
      .select("*")
      .eq("pack_id", id)
      .eq("approved", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
    createAdminClient()
      .auth.admin.getUserById(pack.user_id)
      .then((r) => r.data.user?.email ?? null)
      .catch(() => null),
  ]);
  const cues = (cueData ?? []) as CueRow[];
  const meta = [MEETING_TYPE_LABELS[pack.meeting_type], pack.counterpart, owner ? `Shared by ${owner}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Page>
      <PageHeader
        back={{ href: "/packs", label: "Packs" }}
        title={pack.title}
        meta={
          <>
            <p>{meta}</p>
            {pack.goal && <p className="mt-1 text-ink-2">Goal: {pack.goal}</p>}
          </>
        }
        actions={cues.length > 0 && <PocketButton packId={pack.id} />}
      >
        <p className="mt-4 text-sm text-ink-2">
          {plural(cues.length, "card")} · read-only. Only the owner can change this pack.
        </p>
      </PageHeader>

      {cues.length === 0 ? (
        <p className="text-base text-muted">The owner has not approved any cards yet.</p>
      ) : (
        <div className="space-y-10">
          {SECTIONS.map((section) => {
            const list = cues.filter(section.match);
            if (list.length === 0) return null;
            return (
              <section key={section.title}>
                <h2 className="mb-3 text-base font-bold">
                  {section.title} <span className="font-mono text-xs font-normal text-muted">{list.length}</span>
                </h2>
                <ul className="divide-y divide-line border-y border-line">
                  {list.map((c) => (
                    <li key={c.id} className="py-3">
                      <p dir="auto" className="font-semibold">
                        {c.prompt}
                      </p>
                      {c.bullets.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {c.bullets.map((b, i) => (
                            <li key={i} className="flex gap-2 text-base text-ink-2">
                              <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-2" />
                              <span dir="auto">{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
