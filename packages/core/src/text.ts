/**
 * Text utilities used by the live engine.
 * Unicode-aware so Urdu, Arabic, Roman Urdu and English text all normalise the same way.
 */

// Accents on Latin letters, Arabic short vowels (harakat), hamza/madda signs and Quranic marks.
const FOLDED_MARKS = /[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;

// Arabic and Urdu spell the same letter with different code points; fold them to one.
const LETTER_FOLDS: Record<string, string> = {
  "\u064a": "\u06cc", // Arabic yeh → Farsi/Urdu yeh
  "\u0649": "\u06cc", // alef maksura → yeh
  "\u0643": "\u06a9", // Arabic kaf → keheh
  "\u0629": "\u0647", // teh marbuta → heh
  "\u06c1": "\u0647", // heh goal → heh
  "\u06c3": "\u0647", // teh marbuta goal → heh
  "\u06be": "\u0647", // heh doachashmee → heh
  "\u0671": "\u0627", // alef wasla → alef
};

function foldScripts(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFKD").replace(FOLDED_MARKS, "")) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660); // Arabic-Indic digits
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0); // Urdu/Persian digits
    else if (code === 0x0640) continue; // tatweel (stretching)
    else out += LETTER_FOLDS[ch] ?? ch;
  }
  return out.normalize("NFC");
}

/**
 * Lowercase, fold spelling variants, strip punctuation, collapse whitespace.
 * Keeps letters and digits in any script, so English, Roman Urdu, Urdu and
 * Arabic text all normalise the same way: "café" → "cafe", "أسعار" → "اسعار",
 * "٢٠٢٦" → "2026".
 */
export function normalizeText(input: string): string {
  return foldScripts(input.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitWords(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

export function countWords(input: string): number {
  return splitWords(input).length;
}

/**
 * Keeps the last N words of what one speaker said.
 * Streaming speech-to-text sends "partial" text that keeps changing,
 * then a "final" segment that never changes. The window holds both.
 */
export class RollingWindow {
  private committed: string[] = [];
  private partial: string[] = [];

  constructor(private readonly maxWords = 30) {
    if (maxWords < 1) throw new Error("maxWords must be at least 1");
  }

  /** Replace the current in-progress (partial) text. */
  setPartial(text: string): void {
    this.partial = splitWords(text);
  }

  /** Commit a final segment and clear the partial. */
  commit(text: string): void {
    this.committed.push(...splitWords(text));
    this.partial = [];
    if (this.committed.length > this.maxWords) {
      this.committed = this.committed.slice(-this.maxWords);
    }
  }

  /** The last `maxWords` words, committed text first, then the partial. */
  text(): string {
    return [...this.committed, ...this.partial].slice(-this.maxWords).join(" ");
  }

  wordCount(): number {
    return Math.min(this.committed.length + this.partial.length, this.maxWords);
  }

  clear(): void {
    this.committed = [];
    this.partial = [];
  }
}
