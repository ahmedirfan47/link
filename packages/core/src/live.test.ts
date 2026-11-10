import { test } from "node:test";
import assert from "node:assert/strict";
import { HashingEmbedder, LiveEngine, looksLikeQuestion, type LiveCue } from "./index";

const cues: LiveCue[] = [
  {
    id: "rev",
    direction: "incoming",
    kind: "question",
    prompt: "What is your current revenue?",
    variants: ["how much money are you making", "what's your monthly recurring revenue", "how much revenue do you have"],
    bullets: ["SAR 40k MRR", "Up 30% month on month"],
    keywords: [],
    priority: 1,
  },
  {
    id: "comp",
    direction: "incoming",
    kind: "question",
    prompt: "Who are your competitors?",
    variants: ["who else is doing this", "how are you different from other tools"],
    bullets: ["ERPs are generic; we are built for distributors"],
    keywords: ["Odoo", "SAP"],
    priority: 1,
  },
  {
    id: "price",
    direction: "incoming",
    kind: "number",
    prompt: "Pricing",
    variants: ["how much does it cost", "what do you charge"],
    bullets: ["SAR 1,500 per month per depot"],
    keywords: [],
    priority: 1,
  },
  {
    id: "pilot",
    direction: "outgoing",
    kind: "checklist",
    prompt: "Mention the pilot with three Saudi wholesalers",
    variants: ["we are piloting with three wholesalers in Saudi Arabia"],
    bullets: [],
    keywords: [],
    priority: 1,
  },
];

async function engine() {
  const e = new LiveEngine(cues, new HashingEmbedder(), { threshold: 0.35, evalIntervalMs: 0 });
  await e.init();
  return e;
}

test("looksLikeQuestion", () => {
  assert.ok(looksLikeQuestion("What is your burn?"));
  assert.ok(looksLikeQuestion("Okay. And how do you plan to grow"));
  assert.ok(looksLikeQuestion("tell me about the team"));
  assert.ok(!looksLikeQuestion("That makes sense, thanks."));
  assert.ok(!looksLikeQuestion("yes"));
});

test("their question surfaces the matching cue while they are still talking", async () => {
  const e = await engine();
  const events = await e.onTranscript({
    speaker: "them",
    text: "so tell me how much revenue are you making right now",
    final: false,
    atMs: 1000,
  });
  const cue = events.find((ev) => ev.type === "cue");
  assert.equal(cue?.type === "cue" && cue.cue.id, "rev");
});

test("a keyword fires its cue instantly and only once within the cooldown", async () => {
  const e = await engine();
  const first = await e.onTranscript({ speaker: "them", text: "we looked at Odoo before", final: false, atMs: 0 });
  assert.ok(first.some((ev) => ev.type === "cue" && ev.cue.id === "comp" && ev.reason === "keyword"));
  const again = await e.onTranscript({ speaker: "them", text: "we looked at Odoo before you know", final: false, atMs: 500 });
  assert.ok(!again.some((ev) => ev.type === "cue" && ev.reason === "keyword"));
});

test("a question with no prepared cue is reported as unmatched", async () => {
  const e = await engine();
  const events = await e.onTranscript({
    speaker: "them",
    text: "What is your burn rate and how long is your runway?",
    final: true,
    atMs: 2000,
  });
  assert.ok(events.some((ev) => ev.type === "unmatched_question"));
  assert.ok(!events.some((ev) => ev.type === "cue"));
});

test("saying a checklist point ticks it off", async () => {
  const e = await engine();
  assert.equal(e.checklistRemaining.length, 1);
  const events = await e.onTranscript({
    speaker: "you",
    text: "right now we are piloting with three wholesalers in Saudi Arabia",
    final: true,
    atMs: 3000,
  });
  assert.ok(events.some((ev) => ev.type === "checklist_done" && ev.cue.id === "pilot"));
  assert.equal(e.checklistRemaining.length, 0);
});

test("word finder: stalling mid-sentence resurfaces the cue you were reaching for", async () => {
  const e = await engine();
  await e.onTranscript({ speaker: "you", text: "so our pricing is around", final: false, atMs: 1000 });
  assert.deepEqual(await e.tick(1500), [], "not yet: still within the pause allowance");
  const events = await e.tick(3000);
  assert.equal(events[0]?.type, "hesitation");
  assert.equal(events[0]?.type === "hesitation" && events[0].cue.id, "price");
  assert.deepEqual(await e.tick(4000), [], "fires once per stall");
});