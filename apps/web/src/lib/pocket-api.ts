import "server-only";
import { packAccessFromCookies, type PackAccess } from "@/lib/pack-access";

/**
 * Helpers for the JSON routes used by Pocket and the Chrome extension. They
 * use the website's sign-in cookie: the extension has host permission for
 * Link, so Chrome sends the cookie with its requests.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requirePackAccess(packId: unknown): Promise<PackAccess> {
  if (typeof packId !== "string" || !/^[0-9a-f-]{36}$/i.test(packId)) throw new ApiError(400, "Invalid pack.");
  const access = await packAccessFromCookies(packId);
  if (access === "signed-out") throw new ApiError(401, "Sign in to Link first.");
  if (!access) throw new ApiError(404, "Pack not found.");
  return access;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiError(err: unknown): Response {
  if (err instanceof ApiError) return json({ error: err.message }, err.status);
  if (err instanceof Error && err.name === "LimitError") return json({ error: err.message }, 429);
  console.error(err);
  return json({ error: err instanceof Error ? err.message : "Server error." }, 500);
}
