import { useMemo } from 'react';
import { sideBySide, type Row } from '../../utils/lineDiff';

// Raw diff of one field: current (left) against proposed (right), line by
// line. Wide screens get two columns; phones a unified (-/+) list. Runs of
// unchanged lines longer than the context fold into "⋯ n unchanged lines".
const CONTEXT = 3;

type Item = { row: Row; i: number } | { fold: number; i: number };

export default function DiffView({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  const rows = useMemo(() => sideBySide(before ?? '', after ?? ''), [before, after]);
  const changed = rows.some((r) => r.kind === 'changed');

  // Every change plus CONTEXT lines around it; hidden runs become one fold
  const items = useMemo(() => {
    const keep = rows.map(() => false);
    rows.forEach((r, i) => {
      if (r.kind !== 'changed') return;
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = true;
    });
    const out: Item[] = [];
    rows.forEach((row, i) => {
      if (keep[i]) out.push({ row, i });
      else if (i > 0 && !keep[i - 1] && out.length && 'fold' in out[out.length - 1]) (out[out.length - 1] as { fold: number }).fold++;
      else out.push({ fold: 1, i });
    });
    return out;
  }, [rows]);

  if (after === null) return null;   // field not proposed
  const fold = (n: number, i: number, span: number) =>
    <tr key={`f${i}`} className="fold"><td colSpan={span}>⋯ {n} unchanged line{n === 1 ? '' : 's'}</td></tr>;

  return (
    <section className="panel diff">
      <div className="panel-bar">
        <h3>{label}</h3>
        <span className={`state ${changed ? '' : 'muted'}`}>{changed ? 'changed' : 'unchanged'}</span>
      </div>
      {!changed ? <p className="diff-unchanged">No changes to this field.</p> : (
        <div className="diff-scroll">
          <table className="diff-table split">
            <colgroup><col className="ln" /><col /><col className="ln" /><col /></colgroup>
            <tbody>
              {items.map((it) => ('fold' in it ? fold(it.fold, it.i, 4) : (
                <tr key={it.i}>
                  <td className="ln">{it.row.leftNo ?? ''}</td>
                  <td className={`code ${it.row.kind === 'changed' ? (it.row.left !== null ? 'del' : 'pad') : ''}`}>{it.row.left ?? ''}</td>
                  <td className="ln">{it.row.rightNo ?? ''}</td>
                  <td className={`code ${it.row.kind === 'changed' ? (it.row.right !== null ? 'add' : 'pad') : ''}`}>{it.row.right ?? ''}</td>
                </tr>
              )))}
            </tbody>
          </table>
          <table className="diff-table unified">
            <colgroup><col className="ln" /><col className="sign" /><col /></colgroup>
            <tbody>
              {items.flatMap((it) => {
                if ('fold' in it) return [fold(it.fold, it.i, 3)];
                const r = it.row;
                if (r.kind === 'same') return [<tr key={it.i}><td className="ln">{r.rightNo}</td><td className="sign" /><td className="code">{r.right}</td></tr>];
                const out = [];
                if (r.left !== null) out.push(<tr key={`${it.i}-`} className="del"><td className="ln">{r.leftNo}</td><td className="sign">-</td><td className="code">{r.left}</td></tr>);
                if (r.right !== null) out.push(<tr key={`${it.i}+`} className="add"><td className="ln">{r.rightNo}</td><td className="sign">+</td><td className="code">{r.right}</td></tr>);
                return out;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
