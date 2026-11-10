import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[380px] flex-col justify-center px-6">
      <Link href="/" className="mb-10 self-start text-lg font-bold tracking-tight">
        Link
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-2 mb-6 text-base text-muted">
        Enter the email you signed up with. We will send a link that lets you choose a new password.
      </p>
      <ForgotForm />
      <Link href="/login" className="mt-6 text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
        Back to sign in
      </Link>
    </main>
  );
}