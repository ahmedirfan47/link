import { pocketCards } from "@/lib/pocket";
import { apiError, json, requirePackAccess } from "@/lib/pocket-api";

/** One pack's approved cards for Pocket or the Chrome extension: GET /api/pocket-pack?id=<pack id> */
export async function GET(request: Request) {
  try {
    const access = await requirePackAccess(new URL(request.url).searchParams.get("id"));
    const cards = await pocketCards(access);
    const { pack } = access;
    return json({
      pack: { id: pack.id, title: pack.title, language: pack.language, meetingType: pack.meeting_type },
      role: access.role,
      cards,
    });
  } catch (err) {
    return apiError(err);
  }
}
