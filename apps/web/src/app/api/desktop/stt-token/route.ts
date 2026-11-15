import { z } from "zod";
import { HttpError, errorResponse, requireBearer } from "@/lib/supabase/bearer";
import { SttTokenError, issueSttToken } from "@/lib/stt";
import { consume } from "@/lib/usage";

const BodySchema = z.object({ language: z.string().max(16).default("en") });

/**
 * Issues a short-lived AssemblyAI streaming token for the desktop app.
 * One token can open both streams (you and them) within its redemption window.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await requireBearer(request);
    await consume(userId, "stt_tokens");
    const { language } = BodySchema.parse(await request.json().catch(() => ({})));
    try {
      return Response.json(await issueSttToken(language));
    } catch (err) {
      if (err instanceof SttTokenError) throw new HttpError(502, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
