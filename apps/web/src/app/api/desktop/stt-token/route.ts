import { z } from "zod";
import { assemblyaiApiKey } from "@/lib/env";
import { HttpError, errorResponse, requireBearer } from "@/lib/supabase/bearer";
import { consume } from "@/lib/usage";

const BodySchema = z.object({ language: z.string().max(16).default("en") });

/** English-only packs use the cheaper, fastest model; mixed-language packs use one that code-switches. */
function speechModel(language: string): string {
  return language === "en" ? "universal-streaming-english" : "universal-3-6-pro";
}

/**
 * Issues a short-lived AssemblyAI streaming token so the desktop app can open
 * the transcription WebSocket without ever seeing the real API key.
 * One token can open both streams (you and them) within its redemption window.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireBearer(request);
    await consume(userId, "stt_tokens");
    const { language } = BodySchema.parse(await request.json().catch(() => ({})));
    const apiKey = assemblyaiApiKey();

    const res = await fetch("https://token.assemblyai.com/v1/token", {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        product: "streaming",
        expires_in_seconds: 120,
        max_session_duration_seconds: 10_800,
      }),
    });

    let token: string | undefined;
    if (res.ok) {
      token = ((await res.json()) as { token?: string }).token;
    } else {
      // Older token endpoint, kept as a fallback.
      const legacy = await fetch(
        "https://streaming.assemblyai.com/v3/token?expires_in_seconds=120&max_session_duration_seconds=10800",
        { headers: { authorization: apiKey } },
      );
      if (!legacy.ok) {
        throw new HttpError(502, `Transcription service refused the token request (${res.status}/${legacy.status}).`);
      }
      token = ((await legacy.json()) as { token?: string }).token;
    }
    if (!token) throw new HttpError(502, "Transcription service returned no token.");

    return Response.json({
      provider: "assemblyai",
      token,
      speechModel: speechModel(language),
      url: "wss://streaming.assemblyai.com/v3/ws",
      sampleRate: 16_000,
    });
  } catch (err) {
    return errorResponse(err);
  }
}