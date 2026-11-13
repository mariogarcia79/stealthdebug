// ---------------------------------------------------------------------------
// Drafts (per post, in this browser only)
// ---------------------------------------------------------------------------
export interface Snapshot { title: string; summary: string; content: string; tags: string[]; series: string; published: boolean; mcpVisible: boolean }
export interface Draft extends Snapshot { savedAt: number }

const draftKey = (id?: string) => `stealthdebug:draft:${id ?? 'new'}`;

export function readDraft(id?: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
export function writeDraft(id: string | undefined, s: Snapshot) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch { /* storage full or disabled: drafts are a convenience */ }
}
export function clearDraft(id?: string) {
  try { localStorage.removeItem(draftKey(id)); } catch { /* ignore */ }
}
export const same = (a: Snapshot, b: Snapshot) =>
  a.title === b.title && a.summary === b.summary && a.content === b.content &&
  (a.tags ?? []).join('\n') === (b.tags ?? []).join('\n') && (a.series ?? '') === (b.series ?? '') &&
  (a.published ?? b.published) === b.published &&
  (a.mcpVisible ?? b.mcpVisible) === b.mcpVisible;

// New posts start as drafts: visible only to the admin until published
export const EMPTY: Snapshot = { title: '', summary: '', content: '', tags: [], series: '', published: false, mcpVisible: true };

