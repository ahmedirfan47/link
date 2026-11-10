import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">This page does not exist</h1>
      <p className="mt-2 text-base text-muted">It may have been deleted, or the link is wrong.</p>
      <Link href="/packs" className="btn mt-6 self-start">
        Go to your packs
      </Link>
    </main>
  );
}