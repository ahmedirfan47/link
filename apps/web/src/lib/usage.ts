import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily caps per user, so one account cannot run up the AI and transcription
 * bill. Counters reset at midnight UTC. Override any cap with an environment
 * variable, e.g. LINK_CAP_PACK_GENERATIONS=20.
 */
export const USAGE_CAPS = {
  pack_generations: { cap: 10, label: "cue generations" },
  answer_cues: { cap: 60, label: "answers turned into cues" },
  rehearsal_grades: { cap: 150, label: "rehearsal checks" },
  link_imports: { cap: 40, label: "link imports" },
  chat_imports: { cap: 20, label: "chat imports" },
  live_fallbacks: { cap: 120, label: "live drafted answers" },
  live_sessions: { cap: 20, label: "live calls" },
  stt_tokens: { cap: 60, label: "transcription connections" },
  call_summaries: { cap: 20, label: "call summaries" },
  mcp_calls: { cap: 500, label: "connector requests" },
  ask_messages: { cap: 100, label: "Ask questions" },
} as const;

export type UsageKind = keyof typeof USAGE_CAPS;

export class LimitError extends Error {
  readonly status = 429;
}

export function capFor(kind: UsageKind): number {
  const env = Number(process.env[`LINK_CAP_${kind.toUpperCase()}`]);
  return Number.isFinite(env) && env > 0 ? Math.floor(env) : USAGE_CAPS[kind].cap;
}

/**
 * Records one use of `kind` for the user, or throws LimitError when today's cap
 * is already reached. Call it before the expensive work starts.
 */
export async function consume(userId: string, kind: UsageKind, amount = 1): Promise<void> {
  const { data, error } = await createAdminClient().rpc("consume_usage_for", {
    p_user: userId,
    p_kind: kind,
    p_amount: amount,
    p_cap: capFor(kind),
  });
  if (error) throw new Error(`Could not check usage: ${error.message}`);
  if (data !== true) {
    throw new LimitError(
      `You have reached today's limit of ${capFor(kind)} ${USAGE_CAPS[kind].label}. It resets at midnight UTC.`,
    );
  }
}

/** Today's counters for the settings page. */
export async function todaysUsage(userId: string): Promise<Record<string, number>> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await createAdminClient()
    .from("usage_counters")
    .select("kind, amount")
    .eq("user_id", userId)
    .eq("day", today);
  return Object.fromEntries((data ?? []).map((r) => [r.kind as string, r.amount as number]));
}