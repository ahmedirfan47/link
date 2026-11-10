import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Link</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Prepare for any conversation. Recall instantly. Improve after every call.
        </p>
      </div>
      <LoginForm initialError={typeof error === "string" ? error : undefined} />
    </main>
  );
}