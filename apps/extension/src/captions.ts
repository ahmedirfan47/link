import type { CaptionBlock } from "./messages";

/**
 * Reading Google Meet's captions from the page. Meet has no API for this and
 * changes its markup from time to time, so this looks for the captions region
 * by its accessible label first and falls back to known class names.
 */

const REGION_SELECTORS = [
  '[role="region"][aria-label*="aption" i]', // "Captions" (English UI)
  '[role="region"][aria-label*="ubtit" i]', // "Subtitles"
  '[role="region"][aria-label*="ترجمة" i]', // Arabic UI
  '[role="region"][aria-label*="کیپشن" i]', // Urdu UI
  "div.a4cQT", // older Meet builds
  'div[jsname="dsyhDe"]',
];

export function findCaptionRegion(root: ParentNode = document): HTMLElement | null {
  for (const selector of REGION_SELECTORS) {
    const el = root.querySelector<HTMLElement>(selector);
    if (el && el.innerText.trim().length > 0) return el;
  }
  for (const selector of REGION_SELECTORS) {
    const el = root.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

/** True when the page looks like an active meeting (not the lobby). */
export function inMeeting(root: ParentNode = document): boolean {
  return Boolean(
    root.querySelector('[aria-label*="Leave call" i], [aria-label*="leave call" i], button[jsname="CQylAd"]'),
  );
}

const MAX_SPEAKER_CHARS = 60;

/**
 * Splits the region's text into speaker blocks. Each block in Meet is a
 * speaker name on its own line followed by what they said.
 */
export function parseCaptionText(text: string): CaptionBlock[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const blocks: CaptionBlock[] = [];
  let current: CaptionBlock | null = null;
  for (const line of lines) {
    const looksLikeName =
      line.length <= MAX_SPEAKER_CHARS && !/[.?!؟،,]$/.test(line) && line.split(/\s+/).length <= 5;
    if (looksLikeName && (current === null || current.text.length > 0)) {
      // A new speaker line, unless it is the first line of speech for the current block.
      if (current && current.text.length > 0) blocks.push(current);
      current = { speaker: line, text: "" };
      continue;
    }
    if (!current) current = { speaker: "", text: "" };
    current.text = current.text ? `${current.text} ${line}` : line;
  }
  if (current && current.text.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Reads speaker blocks. Each Meet caption block has the speaker's avatar
 * (an image), their name, then the text. The largest element holding exactly
 * one avatar is one block: its first line is the name, the rest is speech.
 * Without avatars, falls back to splitting the text by lines.
 */
export function readBlocks(region: HTMLElement): CaptionBlock[] {
  const avatars = Array.from(region.querySelectorAll("img"));
  const blocks: CaptionBlock[] = [];
  const seen = new Set<Element>();
  for (const img of avatars) {
    let block: HTMLElement = img;
    while (
      block.parentElement &&
      block.parentElement !== region &&
      block.parentElement.querySelectorAll("img").length === 1
    ) {
      block = block.parentElement;
    }
    if (seen.has(block)) continue;
    seen.add(block);
    const lines = block.innerText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length >= 2) blocks.push({ speaker: lines[0]!, text: lines.slice(1).join(" ") });
  }
  if (blocks.length > 0) return blocks.slice(-4);
  return parseCaptionText(region.innerText).slice(-4);
}

/** Meet labels your own captions "You" (or the local word for it). */
export function isSelf(speaker: string): boolean {
  return /^(you|أنت|انت|آپ|تم|vous|du|tú|tu|voi)$/i.test(speaker.trim());
}
