import { z } from "zod";
import { MAX_SOURCE_CHARS } from "@/lib/extract";
import { cleanMessages, shareKindOf, transcriptToText } from "@link/core";
import { HttpError, errorResponse, requireBearer } from "@/lib/supabase/bearer";
import { consume } from "@/lib/usage";

/**
 * The desktop app read a ChatGPT or Claude share link in its own browser
 * window (for sites that block servers) and sends the conversation here.
 */

const Body = z.object({
  url: z.string().max(2000),
  title: z.string().max(300).default(""),
  messages: z.array(z.unknown()).max(1000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new HttpError(400, "Invalid pack id.");
    const { supabase, userId } = await requireBearer(request);

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "The chat could not be read.");
    const kind = shareKindOf(parsed.data.url);
    if (!kind) throw new HttpError(400, "Only ChatGPT and Claude share links can be added this way.");
    const messages = cleanMessages(parsed.data.messages);
    if (messages.length === 0) throw new HttpError(422, "No messages were found on that page.");

    const { data: pack } = await supabase.from("packs").select("id").eq("id", id).maybeSingle();
    if (!pack) throw new HttpError(404, "Pack not found.");

    await consume(userId, "link_imports");
    const name = kind === "chatgpt_share" ? "ChatGPT" : "Claude";
    const title = `${name}: ${parsed.data.title.trim() || "Shared chat"}`.slice(0, 300);

    const { error } = await supabase.from("sources").insert({
      pack_id: id,
      kind,
      title,
      uri: parsed.data.url,
      content_text: transcriptToText(messages, name).slice(0, MAX_SOURCE_CHARS),
      messages,
      status: "ready",
    });
    if (error) throw error;

    return Response.json({ title, messages: messages.length });
  } catch (err) {
    return errorResponse(err);
  }
}