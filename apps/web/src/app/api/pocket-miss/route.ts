import { z } from "zod";
import { logMiss } from "@/lib/pocket";
import { ApiError, apiError, json, requirePackAccess } from "@/lib/pocket-api";

const Body = z.object({
  packId: z.uuid(),
  question: z.string().trim().min(3).max(300),
  source: z.enum(["pocket", "extension"]).default("extension"),
});

/** A question was heard during a call and no card covered it. */
export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Invalid request.");
    const access = await requirePackAccess(parsed.data.packId);
    await logMiss(access, parsed.data.question, parsed.data.source);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
