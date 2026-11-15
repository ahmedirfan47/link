"use client";

import { useEffect, useState } from "react";

const FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * A date and time in the viewer's own time zone ("Tue 18 Nov, 14:30").
 * The server does not know the viewer's zone, so the text is filled in the browser.
 */
export function LocalTime({ iso, allDay = false }: { iso: string; allDay?: boolean }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const d = new Date(iso);
    setText(
      allDay
        ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
        : d.toLocaleString("en-GB", FORMAT),
    );
  }, [iso, allDay]);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
