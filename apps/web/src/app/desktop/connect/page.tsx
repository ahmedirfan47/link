import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { ConnectClient } from "./connect-client";

export const metadata: Metadata = { title: "Sign in to the desktop app" };

export default async function DesktopConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { challenge } = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase.auth.getClaims();
  const email = String(data?.claims?.email ?? "");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-6">
      <Link href="/" className="mb-10 self-start text-lg font-bold tracking-tight">
        Link
      </Link>
      <ConnectClient challenge={typeof challenge === "string" ? challenge : ""} email={email} />
    </main>
  );
}