/** Types shared by the main process, the preload bridge and both windows. */

export type CallMode = "laptop" | "room";

/** Size of the answer text on the overlay. */
export type OverlayTextSize = "s" | "m" | "l";

export interface Settings {
  serverUrl: string;
  /** laptop = your mic + the computer's sound as two streams; room = one mic hears both sides. */
  mode: CallMode;
  /** 1 (only very close matches) to 5 (show more cards). */
  sensitivity: number;
  micDeviceId: string | null;
  /** Send the transcript once after the call to get a summary (it is not stored). */
  summarize: boolean;
  overlayClickThrough: boolean;
  overlayTextSize: OverlayTextSize;
  /** Skip the "tell them you are using Link" reminder before each call. */
  skipConsentReminder: boolean;
  overlayBounds: { x: number; y: number; width: number; height: number } | null;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface UserInfo {
  id: string;
  email: string;
}

export interface PackSummary {
  id: string;
  title: string;
  meeting_type: string;
  counterpart: string;
  language: string;
  status: string;
  updated_at: string;
}

export interface PackCue {
  id: string;
  direction: "incoming" | "outgoing";
  kind: "question" | "topic" | "number" | "checklist";
  prompt: string;
  variants: string[];
  bullets: string[];
  keywords: string[];
  priority: number;
}

export interface PackDetail {
  pack: {
    id: string;
    title: string;
    meeting_type: string;
    counterpart: string;
    goal: string;
    language: string;
    status: string;
  };
  cues: PackCue[];
}

export interface SttToken {
  provider: "assemblyai";
  token: string;
  speechModel: string;
  url: string;
  sampleRate: number;
}

export interface FallbackResult {
  question: string;
  bullets: string[];
  confident: boolean;
}

export interface SessionEventInput {
  tMs: number;
  type: "cue_shown" | "cue_dismissed" | "checklist_done" | "unmatched_question" | "fallback_cue" | "hesitation";
  payload: Record<string, unknown>;
}

export interface SessionEndInput {
  events: SessionEventInput[];
  transcript?: { speaker: "them" | "you"; text: string }[];
  unmatchedQuestions: string[];
}

export interface SessionEndResult {
  summary: { summary: string; followUps: string[]; practice: string[] } | null;
  suggestedCues: number;
}

/* ------------------------------------------------------------------ */
/*  Overlay                                                            */
/* ------------------------------------------------------------------ */

export type CardKind = "answer" | "number" | "topic" | "recall" | "unprepared";

export interface OverlayCard {
  id: string;
  kind: CardKind;
  title: string;
  bullets: string[];
  /** Short label such as "Keyword" or "92% match". */
  meta: string;
  createdAt: number;
}

export interface OverlayState {
  status: "idle" | "starting" | "listening" | "error";
  packTitle: string;
  cards: OverlayCard[];
  checklist: { id: string; text: string; done: boolean }[];
  clickThrough: boolean;
  textSize: OverlayTextSize;
}

/* ------------------------------------------------------------------ */
/*  The API exposed to both windows as window.link                     */
/* ------------------------------------------------------------------ */

export type HotkeyName = "clearCards";

/** Things the website can ask the app to do through link-app:// links. */
export type DeepLink = { type: "start"; packId: string } | { type: "open" };

/** Result of "Sign in with your browser", pushed from the main process. */
export type AuthEvent = { user: UserInfo } | { error: string };

/** A short status message from the main process, such as reading a share link. */
export interface Notice {
  kind: "working" | "done" | "error";
  text: string;
}

export interface LinkBridge {
  auth: {
    getUser(): Promise<UserInfo | null>;
    signIn(email: string, password: string): Promise<Result<UserInfo>>;
    /** Opens the website to sign in; the result arrives through control.onAuth. */
    signInWithBrowser(): Promise<Result<null>>;
    signOut(): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  api: {
    listPacks(): Promise<Result<PackSummary[]>>;
    getPack(id: string): Promise<Result<PackDetail>>;
    sttToken(language: string): Promise<Result<SttToken>>;
    fallback(packId: string, question: string): Promise<Result<FallbackResult>>;
    startSession(packId: string, title: string): Promise<Result<{ id: string }>>;
    endSession(id: string, body: SessionEndInput): Promise<Result<SessionEndResult>>;
  };
  overlay: {
    /** Control window → overlay: replace the overlay's state. */
    update(state: OverlayState): void;
    show(): void;
    hide(): void;
    /** Overlay window: receive state updates. Returns an unsubscribe function. */
    onState(listener: (state: OverlayState) => void): () => void;
    /** Overlay window: the user dismissed a card. */
    dismiss(cardId: string): void;
    setClickThrough(enabled: boolean): void;
  };
  control: {
    /** Control window: a card was dismissed in the overlay. */
    onDismiss(listener: (cardId: string) => void): () => void;
    onHotkey(listener: (name: HotkeyName) => void): () => void;
    /** A link-app:// link the app was opened with or received while running. */
    onDeepLink(listener: (link: DeepLink) => void): () => void;
    /** Returns (once) a deep link that arrived before the window was ready. */
    takePendingDeepLink(): Promise<DeepLink | null>;
    onAuth(listener: (event: AuthEvent) => void): () => void;
    /** Status of work the main process does on its own (reading a share link). */
    onNotice(listener: (notice: Notice) => void): () => void;
    /** Opens a page of the Link website in the default browser. */
    openWebsite(path: string): void;
  };
}