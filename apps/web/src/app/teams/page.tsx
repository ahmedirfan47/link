import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/page";
import { plural } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { CreateTeamForm } from "./forms";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const { supabase, userId } = await requireUser();
  const [{ data: teams }, { data: members }] = await Promise.all([
    supabase.from("teams").select("id, name, owner_id, created_at").order("created_at", { ascending: true }),
    supabase.from("team_members").select("team_id"),
  ]);
  const count = new Map<string, number>();
  for (const m of members ?? []) count.set(m.team_id as string, (count.get(m.team_id as string) ?? 0) + 1);

  return (
    <Page>
      <PageHeader
        title="Teams"
        meta="Share packs with your team, read-only, and learn together: which answers help on calls and which questions catch people out."
      />
      {(teams ?? []).length > 0 && (
        <ul className="mb-10 divide-y divide-line border-y border-line">
          {(teams ?? []).map((t) => (
            <li key={t.id}>
              <Link
                href={`/teams/${t.id}`}
                className="-mx-3 flex items-center justify-between rounded-md px-3 py-3.5 transition-colors hover:bg-canvas"
              >
                <span className="font-semibold">{t.name}</span>
                <span className="text-sm text-muted">
                  {plural(count.get(t.id as string) ?? 0, "member")}
                  {t.owner_id === userId ? " · owner" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-[420px]">
        <h2 className="mb-2 text-base font-bold">New team</h2>
        <CreateTeamForm />
      </div>
    </Page>
  );
}
