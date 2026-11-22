import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { currentOrigin } from "@/lib/origin";

/**
 * Invite links for pack shares and team seats. Only a hash of the token is
 * stored; the link itself is shown once to the person who created it, who
 * sends it to their teammate. Whoever accepts it while signed in gets access.
 */

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function newInvite(): Promise<{ hash: string; url: string }> {
  const token = randomBytes(24).toString("base64url");
  return { hash: hashInviteToken(token), url: `${await currentOrigin()}/invite/${token}` };
}

export function isInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}
