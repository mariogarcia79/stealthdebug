// Line diff for the review screen (side by side, like a merge view).
// Longest common subsequence over lines; posts are at most a few thousand
// lines, so the O(n·m) table is fine. Common prefix/suffix are trimmed
// first, which keeps the table small for typical edits.

export type Row =
  | { kind: 'same'; left: string; right: string; leftNo: number; rightNo: number }
  | { kind: 'changed'; left: string | null; right: string | null; leftNo: number | null; rightNo: number | null };

export function sideBySide(a: string, b: string): Row[] {
  const L = a === '' ? [] : a.split('\n');
  const R = b === '' ? [] : b.split('\n');
  let start = 0;
  while (start < L.length && start < R.length && L[start] === R[start]) start++;
  let endL = L.length, endR = R.length;
  while (endL > start && endR > start && L[endL - 1] === R[endR - 1]) { endL--; endR--; }

  const l = L.slice(start, endL), r = R.slice(start, endR);
  const n = l.length, m = r.length;
  // lcs[i][j] = LCS length of l[i..], r[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = l[i] === r[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const rows: Row[] = [];
  for (let k = 0; k < start; k++) rows.push({ kind: 'same', left: L[k], right: R[k], leftNo: k + 1, rightNo: k + 1 });

  // Walk the table; runs of deletions/insertions are paired up line by line
  let i = 0, j = 0;
  let dels: number[] = [], ins: number[] = [];
  const flush = () => {
    for (let k = 0; k < Math.max(dels.length, ins.length); k++) {
      const di = dels[k], ij = ins[k];
      rows.push({
        kind: 'changed',
        left: di !== undefined ? l[di] : null, leftNo: di !== undefined ? start + di + 1 : null,
        right: ij !== undefined ? r[ij] : null, rightNo: ij !== undefined ? start + ij + 1 : null,
      });
    }
    dels = []; ins = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && l[i] === r[j]) {
      flush();
      rows.push({ kind: 'same', left: l[i], right: r[j], leftNo: start + i + 1, rightNo: start + j + 1 });
      i++; j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ins.push(j++);
    } else {
      dels.push(i++);
    }
  }
  flush();
  for (let k = 0; k < L.length - endL; k++) {
    rows.push({ kind: 'same', left: L[endL + k], right: R[endR + k], leftNo: endL + k + 1, rightNo: endR + k + 1 });
  }
  return rows;
}

// Every link target in Markdown content (inline, reference-style, autolinks,
// raw HTML href/src), so the reviewer sees exactly where each one points.
export function linkTargets(md: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*["')])?\s*\)/g,   // [text](url "title"), ![alt](url)
    /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm,                    // [ref]: url
    /<((?:https?|mailto|ftp):[^>\s]+)>/g,                              // <https://...>
    /\b(?:href|src)\s*=\s*["']?([^"'\s>]+)/gi,                         // raw HTML
    /(?<![(<"'=])\bhttps?:\/\/[^\s<>()"'`]+/g,                         // bare URLs (GFM autolinks)
  ];
  for (const p of patterns) for (const m of md.matchAll(p)) out.add((m[1] ?? m[0]).trim());
  return [...out];
}

// Same-site link or upload (no request leaves the site)
export const isLocal = (url: string) => url.startsWith('/') && !url.startsWith('//') || url.startsWith('#');
