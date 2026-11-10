import { SiteFooter, SiteHeader } from "./site-header";

/** Layout for long-form text pages (privacy, terms). */
export function ProsePage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[720px] px-6 pt-10">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-8 space-y-4 text-base leading-relaxed text-ink-2 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}