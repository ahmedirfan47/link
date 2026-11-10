import Link from "next/link";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/supabase/server";
import { MEETING_TYPE_LABELS, type PackRow } from "@/lib/rows";
import { NewPackForm } from "./new-pack-form";

export default async function PacksPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("packs")
    .select("*")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  const packs = (data ?? []) as PackRow[];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Your packs</h1>
          <p className="mt-1 text-sm text-zinc-500">
            A pack is everything Link needs for one conversation: your material, the questions you will
            likely get, and the cues to answer them.
          </p>
        </section>

        {packs.length > 0 && (
          <section className="grid gap-3 sm:grid-cols-2">
            {packs.map((p) => (
              <Link key={p.id} href={`/packs/${p.id}`} className="card block transition hover:border-zinc-400">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.title}</h2>
                  <span className="badge">{p.status}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {MEETING_TYPE_LABELS[p.meeting_type]}
                  {p.counterpart ? ` · ${p.counterpart}` : ""}
                </p>
              </Link>
            ))}
          </section>
        )}

        <NewPackForm />
      </main>
    </>
  );
}