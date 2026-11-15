import { normalizeText, splitWords } from "./text";

/**
 * Fast word-based cue search for the browser "pocket" window: type (or say)
 * a few words of what you heard and the best cards come up. No model needed,
 * so it works instantly and offline. The desktop app's live engine uses
 * embeddings instead; this is the light version.
 */

export interface SearchableCue {
  id: string;
  prompt: string;
  variants: readonly string[];
  keywords: readonly string[];
  bullets?: readonly string[];
  priority?: number;
  /** Times the user marked the card as helpful; helpful cards rank a little higher. */
  useful?: number;
}

export interface SearchHit<T> {
  cue: T;
  score: number;
}

/** Common English and Roman-Urdu filler words that carry no meaning for matching. */
const STOP_WORDS = new Set(
  (
    "a an the and or but so to of in on at for with from by about as is are was were be been being do does did " +
    "have has had i you he she it we they me my your our their this that these those there here what which who whom " +
    "how why when where can could would should will shall may might must just like okay ok um uh yeah yes no not " +
    "please tell us me any some also very really then than if into out up down over more most much many " +
    "kya hai hain ka ki ke ko se mein main aur ye yeh wo woh hum aap tum ap apka apki apke hamara hamari " +
    "tha thi the raha rahi rahe kar karte karta karti ho hota hoti bhi to na nahi nahin koi kuch phir " +
    // Urdu script (after folding)
    "کیا ہے ہیں کا کی کے کو سے میں اور یہ وہ ہم اپ تم تھا تھی بھی تو نہیں کوئی کچھ پھر " +
    // Arabic (after folding)
    "فی من علی عن الی ما ماذا هل هو هی انا انت نحن هم ان کان کانت هذا هذه ذلک التی الذی مع او لا نعم قد لم لن"
  )
    .split(" ")
    .map((w) => normalizeText(w)),
);

function meaningfulWords(text: string): string[] {
  return splitWords(text).filter((w) => !STOP_WORDS.has(w));
}

const ARABIC_LETTER = /[\u0600-\u06ff]/;

/**
 * Light stemming so "pricing" matches "price" and "customers" matches "customer".
 * Arabic: drops the article and common attached prefixes ("والسعر" → "سعر").
 */
function stem(word: string): string {
  if (ARABIC_LETTER.test(word)) {
    if (word.length > 4) return word.replace(/^(وال|بال|کال|فال|لل|ال)/u, "") || word;
    return word;
  }
  if (word.length <= 4) return word;
  return word.replace(/(ings|ing|ies|es|s|ed|ly)$/u, "") || word;
}

function stems(words: string[]): Set<string> {
  return new Set(words.map(stem));
}

/** Overlap between the query words and one phrasing of the cue, 0 to 1. */
function overlap(query: Set<string>, partialLast: string | null, phrase: string[]): number {
  if (phrase.length === 0 || (query.size === 0 && !partialLast)) return 0;
  const target = stems(phrase);
  let shared = 0;
  for (const w of query) if (target.has(w)) shared += 1;
  // The last word may still be being typed: count a prefix match as half a word.
  if (partialLast && partialLast.length >= 2 && ![...target].some((t) => t === partialLast)) {
    if ([...target].some((t) => t.startsWith(partialLast))) shared += 0.5;
  }
  const qSize = Math.max(1, query.size + (partialLast ? 1 : 0));
  // Cosine over word sets: rewards covering the query without favouring long cues.
  return shared / Math.sqrt(qSize * target.size);
}

/**
 * Ranks cues against a query. Returns at most `limit` hits scoring above
 * `minScore`, best first. Ties go to the higher-priority (lower number) cue.
 */
export function searchCues<T extends SearchableCue>(
  query: string,
  cues: readonly T[],
  opts: { limit?: number; minScore?: number; partial?: boolean } = {},
): SearchHit<T>[] {
  const limit = opts.limit ?? 5;
  const minScore = opts.minScore ?? 0.25;
  const words = meaningfulWords(query);
  if (words.length === 0) return [];

  // When typing, the last word is probably incomplete.
  const typingLast = opts.partial && !/\s$/.test(query) ? stem(words[words.length - 1]!) : null;
  const complete = stems(typingLast ? words.slice(0, -1) : words);
  const haystack = ` ${normalizeText(query)} `;

  const hits: SearchHit<T>[] = [];
  for (const cue of cues) {
    let best = 0;
    for (const phrase of [cue.prompt, ...cue.variants]) {
      best = Math.max(best, overlap(complete, typingLast, meaningfulWords(phrase)));
    }
    // An exact keyword (a name, a product, a figure) is a strong signal on its own.
    const keywordHit = cue.keywords.some((k) => {
      const needle = normalizeText(k);
      return needle.length > 0 && haystack.includes(` ${needle} `);
    });
    const relevance = best + (keywordHit ? 0.45 : 0);
    if (relevance < minScore) continue;
    // Usefulness only breaks near-ties; it never makes an unrelated card match.
    const boost = Math.min(0.1, (cue.useful ?? 0) * 0.02);
    hits.push({ cue, score: Math.min(1, relevance + boost) });
  }

  hits.sort((a, b) => b.score - a.score || (a.cue.priority ?? 2) - (b.cue.priority ?? 2));
  return hits.slice(0, limit);
}
