/**
 * Only allow returning to a path on this site ("/packs/123"), never to another
 * site ("//evil.com", "https://..."), so links like /login?next=... are safe.
 */
export function safeNext(value: unknown, fallback = "/packs"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value.slice(0, 500);
}