import { useMemo } from 'react';
import { sideBySide } from '../../utils/lineDiff';

// Side-by-side raw diff of one field: current (left) against proposed
// (right), line by line. Unchanged runs longer than a few lines fold.
const CONTEXT = 3;

export default function DiffView({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  const rows = useMemo(() => sideBySide(before ?? '', after ?? ''), [before, after]);
  const changed = rows.some((r) => r.kind === 'changed');

  // Rows to show: every change plus CONTEXT lines around it
  const visible = useMemo(() => {
    const keep = new Array(rows.length).fill(false);
    rows.forEach((r, i) => {
      if (r.kind !== 'changed') return;
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = true;
    });
    return keep;
  }, [rows]);

  if (after === null) return null;   // field not proposed
  return (
    <section className="diff">
      <h3>{label}{!changed && <span className="muted"> · unchanged</span>}</h3>
      {changed && (
        <div className="diff-scroll">
          <table className="diff-table">
            <tbody>
              {rows.map((r, i) => {
                if (!visible[i]) {
                  return visible[i - 1] || i === 0
                    ? <tr key={i} className="fold"><td colSpan={4}>⋯</td></tr>
                    : null;
                }
                const cls = r.kind === 'same' ? '' : 'chg';
                return (
                  <tr key={i}>
                    <td className="ln">{r.leftNo ?? ''}</td>
                    <td className={`code ${cls} ${r.kind === 'changed' && r.left !== null ? 'del' : ''}`}>{r.left ?? ''}</td>
                    <td className="ln">{r.rightNo ?? ''}</td>
                    <td className={`code ${cls} ${r.kind === 'changed' && r.right !== null ? 'add' : ''}`}>{r.right ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
