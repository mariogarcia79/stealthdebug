import { ValidationError } from "../config/errors";
import { MAX_TITLE_LENGTH, MAX_SUMMARY_LENGTH, MAX_CONTENT_LENGTH, MAX_DESCRIPTION_LENGTH } from "../config/validation";
import { CHANGE_KINDS, ChangeKind, ProposedFields, ProposedTranslation } from "../models/ChangeRequest";
import { LANGS, isLang } from "../config/langs";
import { validateInput } from "./validation";
import { normalizeTags, normalizeSeries } from "./postMeta";

// Validation of agents' proposals: the same rules (and sanitising) as the
// admin's editor, plus what each kind needs.
//   edit:        at least one of title, summary, content, tags, series
//   new:         title, summary, content (tags, series optional)
//   translation: title, summary, content (tags and series come from the original)

export function validateKind(kind: unknown): ChangeKind {
  if (!(CHANGE_KINDS as readonly unknown[]).includes(kind)) throw new ValidationError(`kind must be one of ${CHANGE_KINDS.join(", ")}`);
  return kind as ChangeKind;
}

export function validateDescription(d: unknown): string {
  return validateInput(d, false, MAX_DESCRIPTION_LENGTH, "Description");
}

export function validateProposedFields(kind: ChangeKind, raw: unknown): ProposedFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("fields must be an object");
  const b = raw as Record<string, unknown>;
  const allowed = kind === "translation" ? ["title", "summary", "content"] : ["title", "summary", "content", "tags", "series"];
  const extra = Object.keys(b).filter((k) => !allowed.includes(k));
  if (extra.length) throw new ValidationError(`Unknown or not allowed fields for ${kind}: ${extra.join(", ")}`);

  const required = kind !== "edit";
  const out: ProposedFields = {};
  if (required || b.title !== undefined)   out.title   = validateInput(b.title,   false, MAX_TITLE_LENGTH,   "Title");
  if (required || b.summary !== undefined) out.summary = validateInput(b.summary, false, MAX_SUMMARY_LENGTH, "Summary");
  if (required || b.content !== undefined) out.content = validateInput(b.content, true,  MAX_CONTENT_LENGTH, "Content");
  if (b.tags !== undefined)   out.tags   = normalizeTags(b.tags);
  if (b.series !== undefined) out.series = normalizeSeries(b.series);
  if (Object.keys(out).length === 0) throw new ValidationError("An edit must change at least one field");
  return out;
}

// Translations proposed together with a new post: one per language other
// than the post's (with en/es, at most one). Same rules as a translation.
export function validateTranslations(raw: unknown, postLang: string): ProposedTranslation[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError("translations must be a list");
  const seen = new Set<string>();
  return raw.map((t, i) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) throw new ValidationError(`translations[${i}] must be an object`);
    const b = t as Record<string, unknown>;
    const extra = Object.keys(b).filter((k) => !["lang", "title", "summary", "content"].includes(k));
    if (extra.length) throw new ValidationError(`Unknown fields in translations[${i}]: ${extra.join(", ")}`);
    if (!isLang(b.lang)) throw new ValidationError(`translations[${i}].lang must be one of ${LANGS.join(", ")}`);
    if (b.lang === postLang) throw new ValidationError(`translations[${i}].lang must differ from the post's language (${postLang})`);
    if (seen.has(b.lang)) throw new ValidationError(`Two translations into ${b.lang}`);
    seen.add(b.lang);
    const f = validateProposedFields("translation", { title: b.title, summary: b.summary, content: b.content });
    return { lang: b.lang, title: f.title!, summary: f.summary!, content: f.content! };
  });
}
