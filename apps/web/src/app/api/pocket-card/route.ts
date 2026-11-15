import { z } from "zod";
import { hideCard, saveCard, starCard } from "@/lib/pocket";
import { ApiError, apiError, json, requirePackAccess } from "@/lib/pocket-api";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("star"), packId: z.uuid(), cueId: z.uuid() }),
  z.object({ action: z.literal("hide"), packId: z.uuid(), cueId: z.uuid() }),
  z.object({
    action: z.literal("save"),
    packId: z.uuid(),
    question: z.string().trim().min(3).max(500),
    bullets: z.array(z.string().max(300)).min(1).max(5),
  }),
]);

/** Star, hide or save a card from the Chrome extension. */
export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Invalid request.");
    const body = parsed.data;
    const access = await requirePackAccess(body.packId);
    if (body.action === "star") return json({ count: await starCard(access, body.cueId) });
    if (body.action === "hide") {
      await hideCard(access, body.cueId).catch((e: Error) => {
        throw new ApiError(403, e.message);
      });
      return json({ ok: true });
    }
    const id = await saveCard(access, body.question, body.bullets).catch((e: Error) => {
      throw new ApiError(403, e.message);
    });
    return json({ id });
  } catch (err) {
    return apiError(err);
  }
}
