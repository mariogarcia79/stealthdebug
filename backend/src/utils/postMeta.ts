import { ValidationError } from "../config/errors";
// Pure helpers for post metadata (no I/O), unit-tested in postMeta.test.ts.

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 30;
export const MAX_SERIES_LENGTH = 80;
const WORDS_PER_MINUTE = 220;

const TAG_RE = /^[a-z0-9][a-z0-9+.-]*$/;

// Estimated reading time in minutes (at least 1). Markdown syntax, image
// links and URLs don't count as words.
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")        // images
    .replace(/\]\([^)]*\)/g, "] ")                 // link targets
    .replace(/[#>*_`~|-]+/g, " ");
  const words = text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// "#Embedded Linux" -> "embedded-linux". Throws on anything that isn't a
// list of short tags.
export function normalizeTags(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new ValidationError("tags must be a list of strings");
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") throw new ValidationError("tags must be a list of strings");
    const tag = raw.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH || !TAG_RE.test(tag)) {
      throw new ValidationError(`Invalid tag "${raw}": use letters, digits, "-", "+" or "." (max ${MAX_TAG_LENGTH})`);
    }
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > MAX_TAGS) throw new ValidationError(`At most ${MAX_TAGS} tags`);
  return out;
}

// Series name: plain text, single line. Empty string = not part of a series.
export function normalizeSeries(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "string") throw new ValidationError("series must be a string");
  const s = input.replace(/<[^>]*>/g, "").replace(/[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim();
  if (s.length > MAX_SERIES_LENGTH) throw new ValidationError(`series must be at most ${MAX_SERIES_LENGTH} characters`);
  return s;
}
