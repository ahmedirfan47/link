import "server-only";
import { eventsBetween, type CalendarEvent } from "@link/core";
import { isPrivateHost } from "@/lib/extract";

/**
 * Reads the user's calendar from its private iCal address (Google Calendar:
 * "Secret address in iCal format"). The address is only ever fetched by the
 * server and never shown back in full.
 */

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export class CalendarFeedError extends Error {}

/** Accepts https:// and webcal:// addresses on public hosts; returns the https form. */
export function normalizeFeedUrl(raw: string): URL {
  let text = raw.trim();
  if (/^webcals?:\/\//i.test(text)) text = text.replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new CalendarFeedError("Paste the full address, starting with https://.");
  }
  if (url.protocol !== "https:") throw new CalendarFeedError("The address must start with https://.");
  if (url.username || url.password || isPrivateHost(url.hostname)) {
    throw new CalendarFeedError("That address cannot be used.");
  }
  return url;
}

/** "calendar.google.com/…/basic.ics" with the secret part hidden. */
export function maskFeedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return `${url.hostname}/…/${last}`;
  } catch {
    return "calendar";
  }
}

async function fetchIcs(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "text/calendar, text/plain;q=0.8", "User-Agent": "Link calendar reader" },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new CalendarFeedError("Could not reach the calendar. Check the address.");
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) break;
      url = normalizeFeedUrl(new URL(next, url).toString()); // every hop must stay public
      continue;
    }
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new CalendarFeedError("The calendar refused the address. It may have been reset; paste the new one.");
    }
    if (!res.ok || !res.body) throw new CalendarFeedError("Could not read the calendar.");

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new CalendarFeedError("The calendar is too large to read.");
      }
      chunks.push(value);
    }
    const text = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
    if (!text.includes("BEGIN:VCALENDAR")) throw new CalendarFeedError("That address is not an iCal calendar.");
    return text;
  }
  throw new CalendarFeedError("The calendar address redirects too many times.");
}

/** Timed events from now until `days` ahead (all-day events are skipped). */
export async function upcomingMeetings(feedUrl: string, days = 10): Promise<CalendarEvent[]> {
  const ics = await fetchIcs(normalizeFeedUrl(feedUrl));
  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000); // include one that started in the last hour
  const to = new Date(now.getTime() + days * 86_400_000);
  return eventsBetween(ics, from, to).filter((e) => !e.allDay && e.end > now);
}

/** Checks an address before saving it: it must load and parse. */
export async function checkFeed(feedUrl: string): Promise<number> {
  const events = await upcomingMeetings(feedUrl, 14);
  return events.length;
}
