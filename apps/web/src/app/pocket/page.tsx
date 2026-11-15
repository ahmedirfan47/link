import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pocket", robots: { index: false } };

/**
 * Pick a pack for the Pocket window. Bookmark this page, or install it from
 * Chrome's menu (Cast, save and share → Install page as app) to open Pocket
 * in its own small window whenever you need it.
 */
export default async function PocketIndexPage() {
  const { supabase } = await requireUser();
  const [{ data: packs }, { data: cues }] = await Promise.all([
    supabase.from("packs").select("id, title, updated_at").order("updated_at", { ascending: false }),
    supabase.from("cues").select("pack_id").eq("approved", true),
  ]);
  const counts = new Map<string, number>();
  for (const c of cues ?? []) counts.set(c.pack_id as string, (counts.get(c.pack_id as string) ?? 0) + 1);

  return (
    <main className="min-h-screen bg-canvas px-3 py-3 text-ink">
      <h1 className="mb-1 text-base font-bold">Pocket</h1>
      <p className="mb-3 text-xs text-muted">Choose a pack. Its approved cues open in this small window.</p>
      {(packs ?? []).length === 0 ? (
        <p className="text-sm text-muted">
          No packs yet.{" "}
          <Link href="/packs/new" className="underline underline-offset-2" target="_blank">
            Create one
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-1.5">
          {(packs ?? []).map((p) => {
            const n = counts.get(p.id as string) ?? 0;
            return (
              <li key={p.id as string}>
                <Link
                  href={`/pocket/${p.id}`}
                  className="block rounded-md border border-line bg-surface px-3 py-2 hover:border-line-strong"
                >
                  <span className="block truncate text-sm font-semibold">{p.title as string}</span>
                  <span className="block text-2xs text-muted">{n === 0 ? "No approved cues yet" : `${n} approved cues`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
