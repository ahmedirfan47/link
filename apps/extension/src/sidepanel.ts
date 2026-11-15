// Imported by path (not "@link/core") so the panel does not bundle the schema library.
import { looksLikeQuestion } from "../../../packages/core/src/live";
import { searchCues } from "../../../packages/core/src/search";
import { LINK_URL, SignedOutError, api, type Card, type GrokAnswer, type PackItem } from "./api";
import { isSelf } from "./captions";
import type { CaptionsMessage, LinkMessage } from "./messages";

/**
 * Link's side panel. Pick a pack; during a Google Meet call it reads Meet's
 * captions (from the content script), finds the card for what the other side
 * just said, and offers Grok for questions no card covers.
 */

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

type Tab = "questions" | "numbers" | "mine";

interface State {
  phase: "loading" | "signed-out" | "error" | "no-packs" | "ready";
  error: string;
  packs: PackItem[];
  packId: string | null;
  title: string;
  role: "owner" | "viewer";
  cards: Card[];
  tab: Tab;
  open: Set<string>;
  query: string;
  onMeet: boolean;
  captionsOn: boolean;
  inCall: boolean;
  heard: string;
  pinned: { id: string; score: number; at: number } | null;
  lastQuestion: string;
  answer: (GrokAnswer & { question: string; saved?: boolean }) | null;
  asking: boolean;
  askError: string;
  notice: string;
  consent: "needed" | "given";
  copied: boolean;
}

const state: State = {
  phase: "loading",
  error: "",
  packs: [],
  packId: null,
  title: "",
  role: "viewer",
  cards: [],
  tab: "questions",
  open: new Set(),
  query: "",
  onMeet: false,
  captionsOn: false,
  inCall: false,
  heard: "",
  pinned: null,
  lastQuestion: "",
  answer: null,
  asking: false,
  askError: "",
  notice: "",
  consent: "needed",
  copied: false,
};

const LISTEN_WINDOW_WORDS = 22;
const HOLD_MS = 6000;
const FINAL_AFTER_MS = 1400;
const CONSENT_MESSAGE =
  "Quick note before we start: I use an AI assistant that takes notes during calls. Is that okay with you?";

const missed = new Set<string>();
let finalTimer: number | undefined;

/* ------------------------------------------------------------------ */
/*  Tiny DOM helper                                                    */
/* ------------------------------------------------------------------ */

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "className") {
      el.className = String(value);
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}

function lastWords(text: string, n: number): string {
  return text.trim().split(/\s+/).slice(-n).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Static layout: built once so the search box keeps focus            */
/* ------------------------------------------------------------------ */

const app = document.getElementById("app")!;
const packSelect = h("select", { "aria-label": "Pack", onChange: () => void selectPack(packSelect.value) });
const search = h("input", {
  type: "search",
  placeholder: "Type what they asked…",
  "aria-label": "Search cards",
  autocomplete: "off",
  onInput: () => {
    state.query = search.value;
    state.answer = null;
    render();
  },
  onKeydown: (e: KeyboardEvent) => {
    if (e.key === "Enter" && askable()) void askGrok(askable());
    if (e.key === "Escape") {
      search.value = "";
      state.query = "";
      render();
    }
  },
});
const statusLine = h("div", { className: "status" });
const heardLine = h("div", { className: "heard", dir: "auto" });
const main = h("main");
const footer = h("footer");

app.append(
  h(
    "header",
    {},
    h("span", { className: "wordmark" }, "Link"),
    packSelect,
    h("button", { className: "btn-quiet", title: "Reload packs", "aria-label": "Reload packs", onClick: () => void load() }, "↻"),
  ),
  h("div", { className: "bar" }, search, statusLine, heardLine),
  main,
  footer,
);

/* ------------------------------------------------------------------ */
/*  Loading                                                            */
/* ------------------------------------------------------------------ */

async function load() {
  state.phase = "loading";
  render();
  try {
    state.packs = await api.packs();
    if (state.packs.length === 0) {
      state.phase = "no-packs";
      render();
      return;
    }
    const saved = (await chrome.storage.local.get("packId")).packId as string | undefined;
    const pick = state.packs.find((p) => p.id === saved) ?? state.packs[0]!;
    await selectPack(pick.id);
  } catch (err) {
    state.phase = err instanceof SignedOutError ? "signed-out" : "error";
    state.error = err instanceof Error ? err.message : "Something went wrong.";
    render();
  }
}

async function selectPack(id: string) {
  state.packId = id;
  state.pinned = null;
  state.answer = null;
  state.open.clear();
  void chrome.storage.local.set({ packId: id });
  try {
    const detail = await api.pack(id);
    state.cards = detail.cards;
    state.role = detail.role;
    state.title = detail.pack.title;
    state.phase = "ready";
  } catch (err) {
    state.phase = err instanceof SignedOutError ? "signed-out" : "error";
    state.error = err instanceof Error ? err.message : "Could not load the pack.";
  }
  render();
}

/* ------------------------------------------------------------------ */
/*  Captions from Google Meet                                          */
/* ------------------------------------------------------------------ */

function onCaptions(message: CaptionsMessage) {
  state.onMeet = true;
  state.captionsOn = message.captionsOn;
  state.inCall = message.inCall;
  const theirs = message.blocks.filter((b) => !isSelf(b.speaker));
  const latest = theirs[theirs.length - 1];
  if (!latest) {
    renderStatus();
    return;
  }
  state.heard = latest.text;
  if (state.consent === "given" && state.phase === "ready") {
    match(latest.text);
    // When the text stops changing, the sentence is finished: check for an unprepared question.
    window.clearTimeout(finalTimer);
    finalTimer = window.setTimeout(() => onFinal(latest.text), FINAL_AFTER_MS);
  }
  render();
}

function match(text: string) {
  const [top] = searchCues(lastWords(text, LISTEN_WINDOW_WORDS), state.cards, { limit: 1, minScore: 0.3 });
  if (!top) return;
  const now = Date.now();
  const current = state.pinned;
  if (!current || current.id === top.cue.id || now - current.at > HOLD_MS || top.score > current.score + 0.15) {
    state.pinned = { id: top.cue.id, score: top.score, at: now };
  }
}

function onFinal(text: string) {
  const sentences = text.split(/(?<=[.?!؟])\s+/).filter(Boolean);
  const last = (sentences[sentences.length - 1] ?? text).trim();
  if (!looksLikeQuestion(last)) return;
  if (searchCues(last, state.cards, { limit: 1, minScore: 0.3 }).length > 0) return;
  state.lastQuestion = last;
  const key = last.toLowerCase();
  if (state.packId && !missed.has(key)) {
    missed.add(key);
    void api.miss(state.packId, last).catch(() => undefined);
  }
  render();
}

chrome.runtime.onMessage.addListener((message: LinkMessage) => {
  if (message.type === "link-captions") onCaptions(message);
  return false;
});

/** Ask the current tab's Meet page for its state when the panel opens. */
async function pingActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const reply = (await chrome.tabs.sendMessage(tab.id, { type: "link-ping" })) as CaptionsMessage | undefined;
    if (reply) onCaptions(reply);
  } catch {
    state.onMeet = false; // not a Meet tab: no content script there
    renderStatus();
  }
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

function askable(): string {
  const q = state.query.trim();
  if (q) {
    const hits = searchCues(q, state.cards, { limit: 1, partial: true, minScore: 0.2 });
    return hits.length === 0 || hits[0]!.score < 0.45 ? q : "";
  }
  return state.lastQuestion;
}

async function askGrok(question: string) {
  if (!state.packId || state.asking || question.trim().length < 3) return;
  state.asking = true;
  state.askError = "";
  state.answer = null;
  render();
  try {
    const answer = await api.ask(state.packId, question.trim());
    state.answer = { ...answer, question: question.trim() };
  } catch (err) {
    state.askError = err instanceof Error ? err.message : "Could not get an answer.";
  } finally {
    state.asking = false;
    render();
  }
}

async function saveAnswer() {
  const a = state.answer;
  if (!a || !state.packId) return;
  try {
    const { id } = await api.save(state.packId, a.question, a.bullets);
    state.answer = { ...a, saved: true };
    state.cards.push({
      id,
      direction: "incoming",
      kind: "question",
      prompt: a.question,
      variants: [],
      bullets: a.bullets,
      keywords: [],
      priority: 1,
      useful: 0,
    });
  } catch (err) {
    state.notice = err instanceof Error ? err.message : "Could not save the card.";
  }
  render();
}

function star(card: Card) {
  if (!state.packId) return;
  card.useful += 1;
  render();
  void api.star(state.packId, card.id).catch((err: Error) => {
    state.notice = err.message;
    render();
  });
}

function hide(card: Card) {
  if (!state.packId) return;
  state.cards = state.cards.filter((c) => c.id !== card.id);
  if (state.pinned?.id === card.id) state.pinned = null;
  state.notice = `Hidden “${card.prompt.slice(0, 40)}”. Approve it again on the pack page to bring it back.`;
  render();
  void api.hide(state.packId, card.id).catch((err: Error) => {
    state.notice = err.message;
    render();
  });
}

function acceptConsent(remember: boolean) {
  state.consent = "given";
  if (remember) void chrome.storage.local.set({ consent: true });
  render();
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function cardView(card: Card, highlight: boolean, open: boolean): HTMLElement {
  return h(
    "div",
    { className: `card${highlight ? " hit" : ""}` },
    h(
      "div",
      { className: "card-head" },
      h(
        "button",
        {
          className: "prompt",
          dir: "auto",
          "aria-expanded": String(open),
          onClick: () => {
            if (state.open.has(card.id)) state.open.delete(card.id);
            else state.open.add(card.id);
            render();
          },
        },
        card.prompt,
      ),
      h(
        "button",
        { className: "btn-quiet small", title: "This card helped", onClick: () => star(card) },
        card.useful > 0 ? `★ ${card.useful}` : "★",
      ),
      state.role === "owner" &&
        h("button", { className: "btn-quiet small", title: "Hide from live use", "aria-label": "Hide", onClick: () => hide(card) }, "✕"),
    ),
    open && card.bullets.length > 0 && h("ul", { className: "bullets" }, ...card.bullets.map((b) => h("li", { dir: "auto" }, b))),
  );
}

function renderStatus() {
  statusLine.replaceChildren();
  let text: string;
  let live = false;
  if (!state.onMeet) text = "Open your Google Meet tab to follow the call. You can still type to search.";
  else if (!state.inCall) text = "Join the meeting to start.";
  else if (!state.captionsOn) text = "Turn on captions in Meet (press c) so Link can follow the call.";
  else if (state.consent !== "given") text = "Waiting for you to confirm below.";
  else {
    text = "Following the call through Meet's captions";
    live = true;
  }
  statusLine.append(h("span", { className: `dot${live ? " on" : ""}` }), h("span", {}, text));
  heardLine.textContent = live && state.heard ? `…${lastWords(state.heard, 14)}` : "";
}

function render() {
  // Pack picker.
  packSelect.replaceChildren(
    ...state.packs.map((p) =>
      h("option", { value: p.id, selected: p.id === state.packId }, p.from ? `${p.title} · ${p.from}` : p.title),
    ),
  );
  packSelect.disabled = state.packs.length === 0;
  search.disabled = state.phase !== "ready";
  renderStatus();
  footer.replaceChildren(
    h("a", { href: `${LINK_URL}${state.packId ? `/packs/${state.packId}` : "/packs"}`, target: "_blank" }, "Open in Link"),
    " · Audio never leaves your computer",
  );

  main.replaceChildren();
  if (state.phase === "loading") {
    main.append(h("p", { className: "muted" }, "Loading…"));
    return;
  }
  if (state.phase === "signed-out") {
    main.append(
      h(
        "div",
        { className: "empty" },
        h("h2", {}, "Sign in to Link"),
        h("p", {}, "Sign in on the Link website in this browser, then come back."),
        h("div", { className: "row", style: "justify-content:center" },
          h("a", { className: "btn", href: `${LINK_URL}/login`, target: "_blank" }, "Sign in"),
          h("button", { className: "btn-line", onClick: () => void load() }, "I've signed in"),
        ),
      ),
    );
    return;
  }
  if (state.phase === "error") {
    main.append(h("div", { className: "empty" }, h("p", { className: "error" }, state.error), h("button", { className: "btn-line", onClick: () => void load() }, "Try again")));
    return;
  }
  if (state.phase === "no-packs") {
    main.append(
      h("div", { className: "empty" }, h("h2", {}, "No packs yet"), h("p", {}, "Create a pack on Link, approve its cards, then reload."),
        h("a", { className: "btn", href: `${LINK_URL}/packs/new`, target: "_blank" }, "Create a pack")),
    );
    return;
  }

  if (state.notice) {
    main.append(h("div", { className: "notice" }, h("span", {}, state.notice), h("button", { className: "btn-quiet", "aria-label": "Close", onClick: () => { state.notice = ""; render(); } }, "✕")));
  }

  // Honest by design: confirm the others know, before following the call.
  if (state.consent !== "given" && state.onMeet && state.inCall) {
    main.append(
      h(
        "div",
        { className: "panel" },
        h("p", {}, h("strong", {}, "Tell the people on the call you are using Link.")),
        h("p", { className: "muted", style: "font-size:12px;margin-top:2px" }, "It is fair, and in some places the law requires everyone to agree. Paste this in the meeting chat:"),
        h("div", { className: "quote" }, CONSENT_MESSAGE),
        h("div", { className: "row" },
          h("button", { className: "btn-line small", onClick: () => void navigator.clipboard.writeText(CONSENT_MESSAGE).then(() => { state.copied = true; render(); }) }, state.copied ? "Copied" : "Copy message"),
          h("button", { className: "btn small", onClick: () => acceptConsent(false) }, "I've told them"),
          h("button", { className: "btn-quiet small", onClick: () => acceptConsent(true) }, "Don't remind me"),
        ),
      ),
    );
  }

  // Ask Grok.
  const question = askable();
  if (question || state.answer || state.asking || state.askError) {
    const box = h("div", { className: "panel" });
    if (state.answer) {
      const a = state.answer;
      box.append(
        h("p", { className: "label" }, a.confident ? "Grok · from your sources" : "Grok · not in your sources: an approach"),
        h("p", { dir: "auto", style: "font-weight:700;font-size:13px" }, a.question),
        h("ul", { className: "bullets" }, ...a.bullets.map((b) => h("li", { dir: "auto" }, b))),
        h("div", { className: "row" },
          a.sources.length > 0 && h("span", { className: "faint", style: "font-size:11px;flex:1" }, a.sources.join(" · ")),
          state.role === "owner" && (a.saved ? h("span", { style: "font-size:12px;color:var(--go)" }, "Saved as a card") : h("button", { className: "btn-line small", onClick: () => void saveAnswer() }, "Save as card")),
        ),
      );
    } else if (state.asking) {
      box.append(h("p", { className: "muted" }, "Asking Grok…"));
    } else if (question) {
      box.append(
        h("div", { className: "row", style: "margin-top:0" },
          h("p", { className: "muted", dir: "auto", style: "flex:1;font-size:12px" }, state.query.trim() ? "No card covers this." : `Not ready for “${question.slice(0, 70)}”?`),
          h("button", { className: "btn small", onClick: () => void askGrok(question) }, "Ask Grok"),
        ),
      );
    }
    if (state.askError) box.append(h("p", { className: "error" }, state.askError));
    main.append(box);
  }

  if (state.cards.length === 0) {
    main.append(h("p", { className: "muted" }, "No approved cards in this pack yet. Approve cards on the pack page, then reload."));
    return;
  }

  const q = state.query.trim();
  if (q) {
    const hits = searchCues(q, state.cards, { limit: 5, partial: true, minScore: 0.2 });
    if (hits.length === 0) main.append(h("p", { className: "muted" }, `No card matches “${q}”.`));
    hits.forEach((hit, i) => main.append(cardView(hit.cue, i === 0, i === 0 || state.open.has(hit.cue.id))));
    return;
  }

  const pinned = state.pinned ? state.cards.find((c) => c.id === state.pinned!.id) : undefined;
  if (pinned) {
    main.append(h("p", { className: "label" }, "Live match"), cardView(pinned, true, true));
  }

  const lists: Record<Tab, Card[]> = {
    questions: state.cards.filter((c) => c.direction === "incoming" && (c.kind === "question" || c.kind === "topic")),
    numbers: state.cards.filter((c) => c.kind === "number"),
    mine: state.cards.filter((c) => c.direction === "outgoing"),
  };
  const labels: Record<Tab, string> = { questions: "Questions", numbers: "Numbers", mine: "My points" };
  main.append(
    h("div", { className: "tabs", role: "group", "aria-label": "Card type" },
      ...(Object.keys(lists) as Tab[]).map((t) =>
        h("button", { "aria-pressed": String(state.tab === t), onClick: () => { state.tab = t; render(); } }, `${labels[t]} ${lists[t].length}`),
      ),
    ),
  );
  const list = lists[state.tab];
  if (list.length === 0) main.append(h("p", { className: "muted" }, "Nothing here yet."));
  for (const c of list) main.append(cardView(c, false, state.open.has(c.id)));
}

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */

void chrome.storage.local.get("consent").then((v) => {
  if (v.consent === true) state.consent = "given";
  render();
});
void load();
void pingActiveTab();
chrome.tabs.onActivated.addListener(() => void pingActiveTab());
