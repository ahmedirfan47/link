import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/page";
import { NewPackForm } from "../new-pack-form";

export const metadata: Metadata = { title: "New pack" };

export default function NewPackPage() {
  return (
    <Page>
      <PageHeader
        back={{ href: "/packs", label: "Packs" }}
        title="New pack"
        meta="Tell Link who you are meeting and what you want out of it. You will add your material next."
      />
      <Link
        href="/packs/interview"
        className="mb-8 flex max-w-[560px] items-center justify-between gap-4 rounded-md border border-line px-4 py-3 transition-colors hover:border-ink-2"
      >
        <span>
          <span className="block font-semibold">Job interview?</span>
          <span className="block text-sm text-muted">Paste the job description and your CV; Link does the rest.</span>
        </span>
        <span aria-hidden className="text-muted">→</span>
      </Link>
      <NewPackForm />
    </Page>
  );
}
