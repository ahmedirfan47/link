"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MeetingTypeSchema, guessMeetingType, type CalendarEvent } from "@link/core";
import { requireUser } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/rows";

const NewPackSchema = z.object({
  title: z.string().trim().min(1, "Give the pack a title.").max(120),
  meetingType: MeetingTypeSchema,
  counterpart: z.string().trim().max(300),
  goal: z.string().trim().max(1000),
  language: z.string().trim().min(2).max(16),
});

export async function createPack(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = NewPackSchema.safeParse({
    title: formData.get("title") ?? "",
    meetingType: formData.get("meetingType") ?? "other",
    counterpart: formData.get("counterpart") ?? "",
    goal: formData.get("goal") ?? "",
    language: formData.get("language") ?? "en",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("packs")
    .insert({
      title: parsed.data.title,
      meeting_type: parsed.data.meetingType,
      counterpart: parsed.data.counterpart,
      goal: parsed.data.goal,
      language: parsed.data.language,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the pack." };

  redirect(`/packs/${data.id}`);
}

export async function deletePack(packId: string): Promise<void> {
  if (!z.uuid().safeParse(packId).success) return;
  const { supabase } = await requireUser();

  const { data: files } = await supabase
    .from("sources")
    .select("storage_path")
    .eq("pack_id", packId)
    .not("storage_path", "is", null);
  const paths = (files ?? []).map((f) => f.storage_path as string);
  if (paths.length > 0) await supabase.storage.from("sources").remove(paths);

  await supabase.from("packs").delete().eq("id", packId);
  revalidatePath("/packs");
  redirect("/packs");
}

/* ------------------------------------------------------------------ */
/*  From a calendar meeting                                            */
/* ------------------------------------------------------------------ */

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The other people in the meeting, as "Sara Khan, Omar (acme.com)". */
function counterpartOf(event: CalendarEvent, ownEmail: string): string {
  const people = [...event.attendees, ...(event.organizer ? [event.organizer] : [])]
    .filter((a) => a.email.toLowerCase() !== ownEmail && !/resource\.calendar\.google\.com$/i.test(a.email))
    .filter((a, i, all) => all.findIndex((b) => b.email.toLowerCase() === a.email.toLowerCase()) === i)
    .map((a) => a.name || a.email);
  const text = people.slice(0, 6).join(", ") + (people.length > 6 ? ` and ${people.length - 6} more` : "");
  return text.slice(0, 300);
}

/** Creates a pack for an upcoming meeting, or opens the one already made for it. */
export async function createPackFromEvent(uid: string): Promise<{ error?: string }> {
  if (typeof uid !== "string" || uid.length === 0 || uid.length > 1000) return { error: "Unknown meeting." };
  const { supabase, userId } = await requireUser();

  const { data: existing } = await supabase.from("packs").select("id").eq("calendar_uid", uid).maybeSingle();
  if (existing) redirect(`/packs/${existing.id}`);

  const { data: feed } = await supabase.from("calendar_feeds").select("ics_url").maybeSingle();
  if (!feed) return { error: "Link your calendar in Settings first." };

  const { CalendarFeedError, upcomingMeetings } = await import("@/lib/calendar-feed");
  let event: CalendarEvent | undefined;
  try {
    event = (await upcomingMeetings(feed.ics_url as string, 14)).find((e) => e.uid === uid);
  } catch (err) {
    return { error: err instanceof CalendarFeedError ? err.message : "Could not read the calendar." };
  }
  if (!event) return { error: "That meeting is no longer on your calendar." };

  const { data: claims } = await supabase.auth.getClaims();
  const ownEmail = String(claims?.claims?.email ?? "").toLowerCase();

  const { data, error } = await supabase
    .from("packs")
    .insert({
      user_id: userId,
      title: (event.title || "Meeting").slice(0, 120),
      meeting_type: guessMeetingType(event.title),
      counterpart: counterpartOf(event, ownEmail),
      goal: "",
      language: "en",
      meeting_at: event.start.toISOString(),
      calendar_uid: uid,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      const { data: again } = await supabase.from("packs").select("id").eq("calendar_uid", uid).maybeSingle();
      if (again) redirect(`/packs/${again.id}`);
    }
    return { error: error?.message ?? "Could not create the pack." };
  }

  const invite = plainText(event.description);
  const details = [
    `Meeting: ${event.title}`,
    event.location ? `Where: ${event.location}` : "",
    event.attendees.length > 0
      ? `Attendees: ${event.attendees.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ")}`
      : "",
    invite ? `\n${invite}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (invite.length >= 20) {
    await supabase.from("sources").insert({
      pack_id: data.id,
      kind: "note",
      title: "Meeting invite",
      content_text: details.slice(0, 20_000),
      status: "ready",
    });
  }

  revalidatePath("/packs");
  redirect(`/packs/${data.id}`);
}
