import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { IdentifyUser } from "./analytics";
import { DownloadIcon } from "./icons";
import { NavLinks } from "./nav-links";

/**
 * The signed-in frame: a quiet sidebar that recedes, and one content sheet
 * that holds the work. On small screens the sidebar becomes a top bar.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";

  return (
    <div className="min-h-screen md:grid md:grid-cols-[208px_1fr]">
      <aside className="flex items-center gap-4 border-b border-line px-4 py-2.5 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:px-3 md:py-4">
        <Link href="/packs" className="px-2 text-lg font-bold tracking-tight text-ink md:mb-6">
          Link
        </Link>
        <NavLinks />
        <Link
          href="/download"
          className="hidden h-8 items-center gap-2 rounded-md px-2 text-sm text-muted transition-colors hover:text-ink md:mt-auto md:mb-2 md:flex"
        >
          <DownloadIcon className="h-4 w-4 shrink-0" />
          Desktop app
        </Link>
        <div className="ml-auto md:ml-0 md:border-t md:border-line md:px-2 md:pt-3">
          <p className="hidden truncate text-xs text-muted md:block" title={email}>
            {email}
          </p>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline md:mt-1">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 bg-surface md:min-h-screen">{children}</div>
      <IdentifyUser id={userId} />
    </div>
  );
}