/**
 * Reads meetings from an iCalendar (.ics) feed, such as Google Calendar's
 * "secret address in iCal format". Handles what calendar feeds actually
 * contain: folded lines, time zones, all-day events, attendees, cancelled
 * events, and simple repeating meetings (daily, weekly, monthly).
 */

export interface Attendee {
  name: string;
  email: string;
}

export interface CalendarEvent {
  /** Stable id of this occurrence: the event UID, plus the start time for repeats. */
  uid: string;
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  allDay: boolean;
  attendees: Attendee[];
  organizer: Attendee | null;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Limits so a huge feed cannot slow the server down. */
const MAX_FEED_CHARS = 5_000_000;
const MAX_OCCURRENCES_PER_EVENT = 500;

function unfold(text: string): string[] {
  return text
    .slice(0, MAX_FEED_CHARS)
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function parseLine(line: string): Prop | null {
  // NAME;PARAM=a;PARAM="b:c":value  (a colon inside quotes is not the separator)
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rawParams] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").toUpperCase(), params, value };
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** Offset of `timeZone` from UTC at a given instant, in minutes. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** A wall-clock time in a time zone, as a real instant. */
export function zonedTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const first = zoneOffsetMinutes(new Date(guess), timeZone);
    const adjusted = guess - first * 60_000;
    // Second pass handles the hours around daylight-saving changes.
    const second = zoneOffsetMinutes(new Date(adjusted), timeZone);
    return new Date(guess - second * 60_000);
  } catch {
    return new Date(guess); // unknown zone: treat as UTC
  }
}

function parseDate(prop: Prop): { date: Date; allDay: boolean } | null {
  const v = prop.value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || prop.params.VALUE === "DATE") {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { date: new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +m[6]!];
  if (m[7] === "Z") return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
  const tz = prop.params.TZID;
  return { date: tz ? zonedTimeToUtc(y, mo, d, h, mi, s, tz) : new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
}

function parsePerson(prop: Prop): Attendee {
  const email = prop.value.replace(/^mailto:/i, "").trim().toLowerCase();
  return { name: (prop.params.CN ?? "").trim(), email: email.includes("@") ? email : "" };
}

interface RawEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: { date: Date; allDay: boolean } | null;
  end: { date: Date; allDay: boolean } | null;
  durationMs: number | null;
  attendees: Attendee[];
  organizer: Attendee | null;
  cancelled: boolean;
  rrule: Record<string, string> | null;
  exdates: number[];
  recurrenceId: number | null;
  startTzid: string | null;
}

function parseDuration(value: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [w, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  return ((((w! * 7 + d!) * 24 + h!) * 60 + mi!) * 60 + s!) * 1000;
}

function readEvents(lines: string[]): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  let depth = 0; // skip nested blocks such as VALARM
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {
        uid: "",
        title: "",
        description: "",
        location: "",
        start: null,
        end: null,
        durationMs: null,
        attendees: [],
        organizer: null,
        cancelled: false,
        rrule: null,
        exdates: [],
        recurrenceId: null,
        startTzid: null,
      };
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("BEGIN:")) {
      depth++;
      continue;
    }
    if (line.startsWith("END:")) {
      if (line === "END:VEVENT" && depth === 0) {
        if (current.uid && current.start) events.push(current);
        current = null;
      } else depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    const prop = parseLine(line);
    if (!prop) continue;
    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim();
        break;
      case "SUMMARY":
        current.title = unescapeText(prop.value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(prop.value);
        break;
      case "LOCATION":
        current.location = unescapeText(prop.value);
        break;
      case "DTSTART":
        current.start = parseDate(prop);
        current.startTzid = prop.params.TZID ?? null;
        break;
      case "DTEND":
        current.end = parseDate(prop);
        break;
      case "DURATION":
        current.durationMs = parseDuration(prop.value);
        break;
      case "ATTENDEE":
        current.attendees.push(parsePerson(prop));
        break;
      case "ORGANIZER":
        current.organizer = parsePerson(prop);
        break;
      case "STATUS":
        current.cancelled = prop.value.trim().toUpperCase() === "CANCELLED";
        break;
      case "RRULE":
        current.rrule = Object.fromEntries(
          prop.value.split(";").map((kv) => {
            const [k, v] = kv.split("=");
            return [(k ?? "").toUpperCase(), (v ?? "").toUpperCase()];
          }),
        );
        break;
      case "EXDATE":
        for (const part of prop.value.split(",")) {
          const d = parseDate({ ...prop, value: part });
          if (d) current.exdates.push(d.date.getTime());
        }
        break;
      case "RECURRENCE-ID": {
        const d = parseDate(prop);
        if (d) current.recurrenceId = d.date.getTime();
        break;
      }
    }
  }
  return events;
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_MS = 86_400_000;

/** Wall-clock parts of an instant in the event's time zone (so weekly repeats keep local time across DST). */
function localParts(date: Date, tz: string | null) {
  if (!tz) {
    return { y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate(), h: date.getUTCHours(), mi: date.getUTCMinutes(), s: date.getUTCSeconds() };
  }
  const shifted = new Date(date.getTime() + zoneOffsetMinutes(date, tz) * 60_000);
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    mi: shifted.getUTCMinutes(),
    s: shifted.getUTCSeconds(),
  };
}

function atLocal(dayUtcMidnight: number, time: { h: number; mi: number; s: number }, tz: string | null): Date {
  const day = new Date(dayUtcMidnight);
  const y = day.getUTCFullYear();
  const mo = day.getUTCMonth() + 1;
  const d = day.getUTCDate();
  return tz ? zonedTimeToUtc(y, mo, d, time.h, time.mi, time.s, tz) : new Date(Date.UTC(y, mo - 1, d, time.h, time.mi, time.s));
}

/** Start times of a repeating event within [from, to]. Supports DAILY, WEEKLY (with BYDAY) and MONTHLY. */
function expand(ev: RawEvent, from: Date, to: Date): Date[] {
  const start = ev.start!.date;
  const rule = ev.rrule!;
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? parseDate({ name: "UNTIL", params: {}, value: rule.UNTIL })?.date ?? null : null;
  const tz = ev.start!.allDay ? null : ev.startTzid;
  const p = localParts(start, tz);
  const time = { h: p.h, mi: p.mi, s: p.s };
  const startDay = Date.UTC(p.y, p.mo - 1, p.d);
  const out: Date[] = [];
  let produced = 0;

  const accept = (when: Date): boolean => {
    if (until && when > until) return false;
    if (produced >= count) return false;
    produced++;
    if (when >= from && when <= to && !ev.exdates.includes(when.getTime())) out.push(when);
    return when <= to;
  };

  if (freq === "DAILY") {
    for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT * 4; i += interval) {
      if (!accept(atLocal(startDay + i * DAY_MS, time, tz))) break;
    }
  } else if (freq === "WEEKLY") {
    const days = (rule.BYDAY ? rule.BYDAY.split(",") : [WEEKDAYS[new Date(startDay).getUTCDay()]!])
      .map((d) => WEEKDAYS.indexOf(d.replace(/^[+-]?\d+/, "")))
      .filter((d) => d >= 0)
      .sort((a, b) => a - b);
    const weekStart = startDay - new Date(startDay).getUTCDay() * DAY_MS;
    outer: for (let w = 0; w < MAX_OCCURRENCES_PER_EVENT; w += interval) {
      for (const dow of days) {
        const day = weekStart + (w * 7 + dow) * DAY_MS;
        if (day < startDay) continue;
        if (!accept(atLocal(day, time, tz))) break outer;
      }
    }
  } else if (freq === "MONTHLY") {
    const first = new Date(startDay);
    for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT; i += interval) {
      const y = first.getUTCFullYear() + Math.floor((first.getUTCMonth() + i) / 12);
      const mo = (first.getUTCMonth() + i) % 12;
      const day = Date.UTC(y, mo, first.getUTCDate());
      if (new Date(day).getUTCDate() !== first.getUTCDate()) continue; // e.g. 31st in a short month
      if (!accept(atLocal(day, time, tz))) break;
    }
  } else if (start >= from && start <= to) {
    out.push(start); // unsupported rule: show the first occurrence only
  }
  return out;
}

/**
 * Meetings that start between `from` and `to`, sorted by start time.
 * Cancelled meetings are left out; edited single occurrences replace their original.
 */
export function eventsBetween(ics: string, from: Date, to: Date): CalendarEvent[] {
  const raw = readEvents(unfold(ics));
  const overrides = new Map<string, Set<number>>();
  for (const e of raw) {
    if (e.recurrenceId !== null) {
      const set = overrides.get(e.uid) ?? new Set<number>();
      set.add(e.recurrenceId);
      overrides.set(e.uid, set);
    }
  }

  const out: CalendarEvent[] = [];
  for (const e of raw) {
    const startDate = e.start!.date;
    const lengthMs =
      e.end && e.end.date > startDate ? e.end.date.getTime() - startDate.getTime() : (e.durationMs ?? (e.start!.allDay ? DAY_MS : 3_600_000));
    const starts = e.rrule && e.recurrenceId === null ? expand(e, from, to) : startDate >= from && startDate <= to ? [startDate] : [];
    for (const s of starts) {
      if (e.cancelled) continue;
      // A repeat that was edited on its own appears separately with a RECURRENCE-ID.
      if (e.rrule && e.recurrenceId === null && overrides.get(e.uid)?.has(s.getTime())) continue;
      const repeating = Boolean(e.rrule) || e.recurrenceId !== null;
      out.push({
        uid: repeating ? `${e.uid}@${s.toISOString()}` : e.uid,
        title: e.title || "Untitled meeting",
        description: e.description,
        location: e.location,
        start: s,
        end: new Date(s.getTime() + lengthMs),
        allDay: e.start!.allDay,
        attendees: e.attendees.filter((a) => a.email || a.name),
        organizer: e.organizer,
      });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Guesses the kind of meeting from its title, for the new pack. */
export function guessMeetingType(
  title: string,
): "investor" | "sales" | "client" | "partner" | "interview" | "presentation" | "viva" | "negotiation" | "other" {
  const t = title.toLowerCase();
  if (/\b(interview|screening|hiring|recruit)/.test(t)) return "interview";
  if (/\b(investor|vc|fund|pitch|seed|series [a-c]|angel)/.test(t)) return "investor";
  if (/\b(viva|defen[cs]e|thesis|dissertation)/.test(t)) return "viva";
  if (/\b(negotiat|contract|terms)/.test(t)) return "negotiation";
  if (/\b(demo|sales|discovery|prospect|proposal|pricing)/.test(t)) return "sales";
  if (/\b(partner|partnership|alliance)/.test(t)) return "partner";
  if (/\b(presentation|webinar|talk|keynote|q&a)/.test(t)) return "presentation";
  if (/\b(client|kickoff|kick-off|check-in|review|onboarding)/.test(t)) return "client";
  return "other";
}
