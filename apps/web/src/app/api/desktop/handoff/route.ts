import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError, errorResponse } from "@/lib/supabase/bearer";

const BodySchema = z.object({
  code: z.string().min(32).max(128),
  verifier: z.string().min(43).max(128),
});

/**
 * Step two of "Sign in with your browser": the desktop app sends the one-time
 * code plus the secret it generated. If they match, it gets a single-use token
 * it can turn into its own Supabase session.
 */
export async function POST(request: Request) {
  try {
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const { code, verifier } = parsed.data;

    const admin = createAdminClient();
    // Mark used in the same statement that reads it, so a code can never be redeemed twice.
    const { data: handoff } = await admin
      .from("desktop_handoffs")
      .update({ used_at: new Date().toISOString() })
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("user_id, challenge")
      .maybeSingle();
    if (!handoff) throw new HttpError(400, "This sign-in link has expired. Start again from the app.");

    const expected = createHash("sha256").update(verifier).digest("base64url");
    if (expected !== handoff.challenge) throw new HttpError(400, "This sign-in link was started on another device.");

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(handoff.user_id as string);
    const email = userData?.user?.email;
    if (userError || !email) throw new HttpError(400, "Account not found.");

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new Error(linkError?.message ?? "Could not create a sign-in token.");

    return Response.json({ email, tokenHash });
  } catch (err) {
    return errorResponse(err);
  }
}