import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/page";
import { InterviewForm } from "./interview-form";

export const metadata: Metadata = { title: "Interview pack" };

export default function InterviewPackPage() {
  return (
    <Page>
      <PageHeader
        back={{ href: "/packs/new", label: "New pack" }}
        title="Prepare for a job interview"
        meta="Paste the job description and add your CV. Link writes the questions you will likely get, with answers built from your own experience, and the questions to ask them."
      />
      <InterviewForm />
    </Page>
  );
}
