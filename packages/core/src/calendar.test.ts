import { test } from "node:test";
import assert from "node:assert/strict";
import { eventsBetween, guessMeetingType, zonedTimeToUtc } from "./calendar";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:one@google.com",
  "SUMMARY:Pitch to Northgate Ventures",
  "DTSTART;TZID=Asia/Karachi:20261118T150000",
  "DTEND;TZID=Asia/Karachi:20261118T160000",
  "DESCRIPTION:Agenda: traction\\, pricing\\nBring the deck",
  "ORGANIZER;CN=Ahmed:mailto:ahmed@example.com",
  "ATTENDEE;CN=Sara Khan;ROLE=REQ-PARTICIPANT:mailto:Sara@Northgate.vc",
  "ATTENDEE;CN=\"Bilal, Partner\":mailto:bilal@northgate.vc",
  "BEGIN:VALARM",
  "TRIGGER:-PT10M",
  "DESCRIPTION:Reminder",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly@google.com",
  "SUMMARY:Sales demo",
  "DTSTART:20261102T090000Z",
  "DTEND:20261102T093000Z",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10",
  "EXDATE:20261118T090000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly@google.com",
  "RECURRENCE-ID:20261116T090000Z",
  "SUMMARY:Sales demo (moved)",
  "DTSTART:20261116T110000Z",
  "DTEND:20261116T113000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancel@google.com",
  "SUMMARY:Cancelled call",
  "DTSTART:20261117T100000Z",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:allday@google.com",
  "SUMMARY:Conference",
  "DTSTART;VALUE=DATE:20261119",
  "DTEND;VALUE=DATE:20261120",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:folded@google.com",
  "SUMMARY:Interview with a very long",
  "  title that was folded",
  "DTSTART:20261120T050000Z",
  "DURATION:PT45M",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const from = new Date("2026-11-15T00:00:00Z");
const to = new Date("2026-11-22T00:00:00Z");

test("reads a meeting with time zone, attendees, escaped text, and skips alarms", () => {
  const ev = eventsBetween(FEED, from, to).find((e) => e.uid === "one@google.com");
  assert.ok(ev);
  assert.equal(ev.title, "Pitch to Northgate Ventures");
  assert.equal(ev.start.toISOString(), "2026-11-18T10:00:00.000Z"); // 15:00 in Karachi (UTC+5)
  assert.equal(ev.end.toISOString(), "2026-11-18T11:00:00.000Z");
  assert.equal(ev.description, "Agenda: traction, pricing\nBring the deck");
  assert.deepEqual(ev.attendees, [
    { name: "Sara Khan", email: "sara@northgate.vc" },
    { name: "Bilal, Partner", email: "bilal@northgate.vc" },
  ]);
  assert.equal(ev.organizer?.email, "ahmed@example.com");
});

test("expands weekly repeats, applies exclusions and edited occurrences", () => {
  const demos = eventsBetween(FEED, from, to).filter((e) => e.title.startsWith("Sales demo"));
  // Mon 16 (moved to 11:00), Wed 18 excluded → only the moved Monday remains in this week.
  assert.deepEqual(
    demos.map((d) => [d.title, d.start.toISOString()]),
    [["Sales demo (moved)", "2026-11-16T11:00:00.000Z"]],
  );
});

test("leaves out cancelled meetings, keeps all-day events and folded titles", () => {
  const events = eventsBetween(FEED, from, to);
  assert.equal(events.some((e) => e.title === "Cancelled call"), false);
  const allDay = events.find((e) => e.uid === "allday@google.com");
  assert.ok(allDay?.allDay);
  const folded = events.find((e) => e.uid === "folded@google.com");
  assert.equal(folded?.title, "Interview with a very long title that was folded");
  assert.equal(folded!.end.getTime() - folded!.start.getTime(), 45 * 60_000);
});

test("results are sorted by start time and limited to the window", () => {
  const events = eventsBetween(FEED, from, to);
  const times = events.map((e) => e.start.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(events.every((e) => e.start >= from && e.start <= to));
});

test("zonedTimeToUtc handles daylight saving time", () => {
  assert.equal(zonedTimeToUtc(2026, 7, 1, 9, 0, 0, "Europe/London").toISOString(), "2026-07-01T08:00:00.000Z");
  assert.equal(zonedTimeToUtc(2026, 12, 1, 9, 0, 0, "Europe/London").toISOString(), "2026-12-01T09:00:00.000Z");
});

test("guessMeetingType reads the title", () => {
  assert.equal(guessMeetingType("Pitch to Northgate Ventures"), "investor");
  assert.equal(guessMeetingType("Product demo with Acme"), "sales");
  assert.equal(guessMeetingType("Interview: Backend engineer"), "interview");
  assert.equal(guessMeetingType("Lunch"), "other");
});
