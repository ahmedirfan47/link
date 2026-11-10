import type { Metadata } from "next";
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
      <NewPackForm />
    </Page>
  );
}