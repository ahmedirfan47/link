import { redirect } from "next/navigation";

/**
 * Supabase sends email confirmations to the Site URL with ?code= when no
 * redirect is set, so forward that to the callback; otherwise go to packs.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await searchParams;
  if (typeof code === "string" && code.length > 0) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }
  redirect("/packs");
}