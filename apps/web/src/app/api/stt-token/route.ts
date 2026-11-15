import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SttTokenError, issueSttToken } from "@/lib/stt";
import { LimitError, consume } from "@/lib/usage";

/**
 * Streaming transcription token for the Pocket window, when it listens to a
 * call tab (Google Meet, Zoom in the browser). Signed-in users only.
 */

const BodySchema = z.object({ language: z.string().max(16).default("en") });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return Response.json({ error: "Sign in again." }, { status: 401 });

  try {
    await consume(userId, "stt_tokens");
    const { language } = BodySchema.parse(await request.json().catch(() => ({})));
    return Response.json(await issueSttToken(language), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof LimitError) return Response.json({ error: err.message }, { status: 429 });
    if (err instanceof SttTokenError) return Response.json({ error: err.message }, { status: 502 });
    console.error(err);
    return Response.json({ error: "Could not start live transcription." }, { status: 500 });
  }
}
