import { test } from "node:test";
import assert from "node:assert/strict";
import { isSelf, parseCaptionText } from "../src/captions";

test("splits Meet caption text into speaker blocks", () => {
  const text = "Sara Khan\nThanks for joining. So what is your monthly revenue right now?\nYou\nWe are at forty thousand.\nSara Khan\nAnd how fast is it growing?";
  assert.deepEqual(parseCaptionText(text), [
    { speaker: "Sara Khan", text: "Thanks for joining. So what is your monthly revenue right now?" },
    { speaker: "You", text: "We are at forty thousand." },
    { speaker: "Sara Khan", text: "And how fast is it growing?" },
  ]);
});

test("keeps Urdu and Arabic speech", () => {
  const blocks = parseCaptionText("Omar\nآپ کی ٹیم میں کتنے لوگ ہیں؟\nLayla\nكم السعر للشركات؟");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.text, "آپ کی ٹیم میں کتنے لوگ ہیں؟");
  assert.equal(blocks[1]?.speaker, "Layla");
});

test("recognises your own captions", () => {
  assert.ok(isSelf("You"));
  assert.ok(isSelf(" you "));
  assert.ok(!isSelf("Yousuf"));
});
