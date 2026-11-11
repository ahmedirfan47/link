import type {
  CueDirection,
  CueKind,
  GapStatus,
  MeetingType,
  PackStatus,
  SourceKind,
  SourceStatus,
} from "@link/core";

/** Database rows exactly as Postgres returns them (snake_case). */

export interface PackRow {
  id: string;
  user_id: string;
  title: string;
  meeting_type: MeetingType;
  counterpart: string;
  goal: string;
  language: string;
  status: PackStatus;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  id: string;
  pack_id: string;
  user_id: string;
  kind: SourceKind;
  title: string;
  uri: string | null;
  storage_path: string | null;
  content_text: string | null;
  /** Turns of a shared or imported chat, for the chat viewer. */
  messages: { role: "user" | "assistant"; text: string }[] | null;
  status: SourceStatus;
  error: string | null;
  created_at: string;
}

/** Source list item without the (possibly large) extracted text. */
export type SourceSummary = Omit<SourceRow, "content_text" | "messages"> & { chars: number; turns: number };

export interface AskMessageRow {
  id: string;
  pack_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface CueRow {
  id: string;
  pack_id: string;
  user_id: string;
  direction: CueDirection;
  kind: CueKind;
  prompt: string;
  variants: string[];
  bullets: string[];
  keywords: string[];
  priority: number;
  approved: boolean;
  source_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface GapRow {
  id: string;
  pack_id: string;
  user_id: string;
  question: string;
  answer: string | null;
  status: GapStatus;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  pack_id: string | null;
  title: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export type SessionEventType =
  | "cue_shown"
  | "cue_dismissed"
  | "checklist_done"
  | "unmatched_question"
  | "fallback_cue"
  | "hesitation";

export interface SessionEventRow {
  id: string;
  session_id: string;
  t_ms: number;
  type: SessionEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

/** The summary is stored as text: an overview, then optional "Follow-ups:" and "Practice:" lists. */
export function parseSummary(text: string | null): { overview: string; followUps: string[]; practice: string[] } | null {
  if (!text?.trim()) return null;
  const blocks = text.split(/\n\n(?=(?:Follow-ups|Practice):\n)/);
  const list = (block: string | undefined) =>
    (block ?? "")
      .split("\n")
      .slice(1)
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);
  return {
    overview: blocks[0]?.trim() ?? "",
    followUps: list(blocks.find((b) => b.startsWith("Follow-ups:"))),
    practice: list(blocks.find((b) => b.startsWith("Practice:"))),
  };
}

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  investor: "Investor",
  sales: "Sales",
  client: "Client",
  partner: "Partner",
  interview: "Interview",
  presentation: "Presentation / Q&A",
  viva: "Viva / defense",
  negotiation: "Negotiation",
  other: "Other",
};

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  file: "File",
  url: "Web page",
  chatgpt_share: "ChatGPT chat",
  claude_share: "Claude chat",
  chat_export: "Chat export",
  note: "Note",
};

/** Action result used by every form. */
export interface ActionState {
  error?: string;
  message?: string;
  /** link-app:// link that lets the desktop app finish what the server could not. */
  desktopUrl?: string;
}