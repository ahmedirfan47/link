"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

const CredentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

function readCredentials(formData: FormData) {
  return CredentialsSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
}

async function origin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host") ?? "localhost:3000"}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = readCredentials(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first. Check your inbox for the link." };
    }
    return { error: "Wrong email or password." };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = readCredentials(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };

  // When email confirmation is turned off in Supabase, the user is signed in immediately.
  if (data.session) redirect(next);
  return { message: "Check your email and open the confirmation link in this browser." };
}

/** Sends a password reset link. Always answers the same way so it cannot reveal who has an account. */
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent("/settings?reset=1")}`,
  });
  if (error && error.status === 429) return { error: "Too many requests. Wait a minute and try again." };
  return { message: "If that email has an account, a reset link is on its way. Open it in this browser." };
}