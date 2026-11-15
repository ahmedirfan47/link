import "server-only";
import { normalizeText } from "@link/core";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The team playbook: what the whole team learned from its calls. Pooled from
 * the team's packs: cards members marked as helpful, questions nobody had a
 * card for (from Pocket, the Chrome extension and desktop calls), and who
 * contributed. Call only after confirming the viewer is a team member.
 */

export interface PlaybookCard {
  id: string;
  packId: string;
  packTitle: string;
  prompt: string;
  bullets: string[];
  stars: number;
}

export interface PlaybookMiss {
  question: string;
  count: number;
  lastAt: string;
  packId: string;
  packTitle: string;
  packOwnerId: string;
}

export interface PlaybookMember {
  userId: string;
  email: string;
  stars: number;
  misses: number;
  calls: number;
}

export interface Playbook {
  packs: { id: string; title: string; ownerId: string; meetingType: string }[];
  topCards: PlaybookCard[];
  misses: PlaybookMiss[];
  members: PlaybookMember[];
}

const SINCE_DAYS = 90;

export async function loadPlaybook(teamId: string): Promise<Playbook> {
  const admin = createAdminClient();
  const { data: packRows } = await admin
    .from("packs")
    .select("id, title, user_id, meeting_type")
    .eq("team_id", teamId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  const packs = (packRows ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    ownerId: p.user_id as string,
    meetingType: p.meeting_type as string,
  }));
  if (packs.length === 0) return { packs, topCards: [], misses: [], members: [] };

  const ids = packs.map((p) => p.id);
  const title = new Map(packs.map((p) => [p.id, p.title]));
  const owner = new Map(packs.map((p) => [p.id, p.ownerId]));
  const since = new Date(Date.now() - SINCE_DAYS * 86_400_000).toISOString();

  const [{ data: cards }, { data: stars }, { data: pocketMisses }, { data: sessions }] = await Promise.all([
    admin
      .from("cues")
      .select("id, pack_id, prompt, bullets, useful_count")
      .in("pack_id", ids)
      .eq("approved", true)
      .gt("useful_count", 0)
      .order("useful_count", { ascending: false })
      .limit(15),
    admin.from("card_stars").select("user_id").in("pack_id", ids).gt("created_at", since),
    admin
      .from("pocket_misses")
      .select("pack_id, user_id, question, created_at")
      .in("pack_id", ids)
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin.from("sessions").select("id, pack_id, user_id").in("pack_id", ids).gt("started_at", since),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  const sessionPack = new Map((sessions ?? []).map((s) => [s.id as string, s.pack_id as string]));
  const { data: callMisses } = sessionIds.length
    ? await admin
        .from("session_events")
        .select("session_id, payload, created_at")
        .in("session_id", sessionIds)
        .eq("type", "unmatched_question")
        .limit(1000)
    : { data: [] };

  // Group missed questions by their normalised text, within each pack.
  const grouped = new Map<string, PlaybookMiss>();
  const addMiss = (packId: string, question: string, at: string) => {
    const q = question.trim();
    const key = `${packId}:${normalizeText(q)}`;
    if (q.length < 3 || !normalizeText(q)) return;
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
      if (at > current.lastAt) current.lastAt = at;
    } else {
      grouped.set(key, {
        question: q,
        count: 1,
        lastAt: at,
        packId,
        packTitle: title.get(packId) ?? "Pack",
        packOwnerId: owner.get(packId) ?? "",
      });
    }
  };
  for (const m of pocketMisses ?? []) addMiss(m.pack_id as string, m.question as string, m.created_at as string);
  for (const e of callMisses ?? []) {
    const packId = sessionPack.get(e.session_id as string);
    const q = String((e.payload as { question?: unknown })?.question ?? "");
    if (packId) addMiss(packId, q, e.created_at as string);
  }
  const misses = [...grouped.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, 25);

  // Contributions per member.
  const tally = new Map<string, { stars: number; misses: number; calls: number }>();
  const bump = (userId: string, field: "stars" | "misses" | "calls") => {
    const t = tally.get(userId) ?? { stars: 0, misses: 0, calls: 0 };
    t[field] += 1;
    tally.set(userId, t);
  };
  for (const s of stars ?? []) bump(s.user_id as string, "stars");
  for (const m of pocketMisses ?? []) bump(m.user_id as string, "misses");
  for (const s of sessions ?? []) bump(s.user_id as string, "calls");

  const members: PlaybookMember[] = [];
  for (const [userId, t] of tally) {
    const { data } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
    members.push({ userId, email: data.user?.email ?? "Former member", ...t });
  }
  members.sort((a, b) => b.stars + b.misses + b.calls - (a.stars + a.misses + a.calls));

  return {
    packs,
    topCards: (cards ?? []).map((c) => ({
      id: c.id as string,
      packId: c.pack_id as string,
      packTitle: title.get(c.pack_id as string) ?? "Pack",
      prompt: c.prompt as string,
      bullets: (c.bullets as string[]) ?? [],
      stars: c.useful_count as number,
    })),
    misses,
    members,
  };
}
