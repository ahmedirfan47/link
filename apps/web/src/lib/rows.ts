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
  status: SourceStatus;
  error: string | null;
  created_at: string;
}

/** Source list item without the (possibly large) extracted text. */
export type SourceSummary = Omit<SourceRow, "content_text"> & { chars: number };

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
}