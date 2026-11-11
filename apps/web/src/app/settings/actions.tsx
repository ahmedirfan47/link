"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/rows";

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "That is already your password." };
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Try a longer one." };
    return { error: error.message };
  }
  return { message: "Password updated." };
}

/* ------------------------------------------------------------------ */
/*  Personal tokens for the Claude / ChatGPT connector                 */
/* ------------------------------------------------------------------ */

export interface TokenState extends ActionState {
  url?: string;
}

export async function createApiToken(_prev: TokenState, formData: FormData): Promise<TokenState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || "Connector";
  const { supabase, userId } = await requireUser();

  const { count } = await supabase
    .from("api_tokens")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  if ((count ?? 0) >= 10) return { error: "You already have 10 active connector links. Revoke one first." };

  const token = `lk_${randomBytes(32).toString("base64url")}`;
  const { error } = await supabase.from("api_tokens").insert({
    user_id: userId,
    name,
    token_hash: createHash("sha256").update(token).digest("hex"),
    token_hint: token.slice(-4),
  });
  if (error) return { error: error.message };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  revalidatePath("/settings");
  return { message: "Connector link created. Copy it now; it will not be shown again.", url: `${origin}/api/mcp/${token}` };
}

export async function revokeApiToken(tokenId: string): Promise<void> {
  if (!z.uuid().safeParse(tokenId).success) return;
  const { supabase } = await requireUser();
  await supabase.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId);
  revalidatePath("/settings");
}

/** Disconnects an app that connected with "Connect" (OAuth): all its tokens stop working. */
export async function disconnectApp(clientId: string): Promise<void> {
  if (!/^lkc_[A-Za-z0-9_-]{16,80}$/.test(clientId)) return;
  const { userId } = await requireUser();
  await createAdminClient()
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .is("revoked_at", null);
  revalidatePath("/settings");
}

/* ------------------------------------------------------------------ */
/*  Delete account                                                     */
/* ------------------------------------------------------------------ */

export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const { data: claims } = await supabase.auth.getClaims();
  const email = String(claims?.claims?.email ?? "");
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (!email || typed !== email.toLowerCase()) return { error: "Type your email address exactly to confirm." };

  const admin = createAdminClient();

  // Remove stored files first: storage is not covered by the database cascade.
  const bucket = admin.storage.from("sources");
  const { data: folders } = await bucket.list(userId, { limit: 1000 });
  for (const folder of folders ?? []) {
    const prefix = `${userId}/${folder.name}`;
    if (folder.id) {
      await bucket.remove([prefix]);
      continue;
    }
    const { data: files } = await bucket.list(prefix, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
    if (paths.length > 0) await bucket.remove(paths);
  }

  // Packs, cues, calls, tokens and counters are removed by "on delete cascade".
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: `Could not delete the account: ${error.message}` };

  await supabase.auth.signOut();
  redirect("/?deleted=1");
}