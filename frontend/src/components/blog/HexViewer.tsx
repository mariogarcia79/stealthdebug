import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useI18n } from '../../i18n';
import { fieldValues, formatXxd, hex, type HexField, type Hexdump } from '../../utils/hexdump';

// Interactive hex dump: offsets, bytes and ASCII; fields in colour. Moving
// the cursor (mouse or arrow keys) over the bytes highlights the field
// under it and shows its name, note and value below.
//
// The grid is rendered once per dump; the cursor, the active field and the
// selection are applied to the DOM directly, so moving over a dump of
// thousands of bytes doesn't re-render thousands of elements.
//
// select mode (the editor's hexdump tool): drag, or Shift+arrows, to select
// a byte range for a new field.

export interface Selection { start: number; end: number }   // indexes into bytes, inclusive

interface Props {
  dump: Hexdump;
  select?: boolean;
  selection?: Selection | null;
  onSelect?: (s: Selection) => void;
  onFieldClick?: (f: HexField) => void;
}

const fieldAt = (map: Int16Array, i: number) => (i >= 0 && i < map.length ? map[i] : -1);

const Grid = memo(function Grid({ dump, cols, fieldOf }: { dump: Hexdump; cols: number; fieldOf: Int16Array }) {
  const first = Math.floor(dump.base / cols) * cols;
  const rows: ReactElement[] = [];
  for (let row = first; row < dump.base + dump.bytes.length; row += cols) {
    const hexCells: ReactElement[] = [];
    const ascii: ReactElement[] = [];
    for (let off = row; off < row + cols; off++) {
      const i = off - dump.base;
      const gap = cols === 16 && off - row === 8 ? ' gap' : '';
      if (i < 0 || i >= dump.bytes.length) {
        hexCells.push(<span key={off} className={`hx-b hx-empty${gap}`} aria-hidden="true">{'  '}</span>);
        ascii.push(<span key={off} className="hx-a hx-empty" aria-hidden="true"> </span>);
        continue;
      }
      const b = dump.bytes[i];
      const f = fieldOf[i];
      const cls = f >= 0 ? ` hf f${f} c${f % 8}${fieldOf[i - 1] !== f ? ' fs' : ''}${fieldOf[i + 1] !== f ? ' fe' : ''}` : '';
      hexCells.push(<span key={off} data-i={i} className={`hx-b${cls}${gap}`}>{hex(b)}</span>);
      ascii.push(<span key={off} data-i={i} className={`hx-a${cls}`}>{b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'}</span>);
    }
    rows.push(
      <div key={row} className="hx-row">
        <span className="hx-off">{hex(row, 8)}</span>
        <span className="hx-hex">{hexCells}</span>
        <span className="hx-ascii">{ascii}</span>
      </div>,
    );
  }
  return <>{rows}</>;
});

export default function HexViewer({ dump, select = false, selection = null, onSelect, onFieldClick }: Props) {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(16);
  const [cursor, setCursor] = useState<number | null>(null);
  const [active, setActive] = useState<number>(-1);   // field index
  const [copied, setCopied] = useState(false);
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);

  // Which field each byte belongs to (-1: none)
  const fieldOf = useMemo(() => {
    const m = new Int16Array(dump.bytes.length).fill(-1);
    dump.fields.forEach((f, k) => { for (let i = f.offset - dump.base; i < f.offset - dump.base + f.length; i++) m[i] = k; });
    return m;
  }, [dump]);

  // 8 bytes per row in narrow columns (phones), 16 otherwise
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setCols(e.contentRect.width < 620 ? 8 : 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cells = useCallback((i: number) => grid.current?.querySelectorAll<HTMLElement>(`[data-i="${i}"]`) ?? [], []);

  // cursor -> DOM
  useEffect(() => {
    if (cursor === null) return;
    cells(cursor).forEach((c) => c.classList.add('cur'));
    return () => cells(cursor).forEach((c) => c.classList.remove('cur'));
  }, [cursor, cells, cols]);

  // active field -> DOM
  useEffect(() => {
    if (active < 0) return;
    const els = grid.current?.querySelectorAll<HTMLElement>(`.f${active}`) ?? [];
    els.forEach((c) => c.classList.add('on'));
    return () => els.forEach((c) => c.classList.remove('on'));
  }, [active, cols, dump]);

  // selection -> DOM
  useEffect(() => {
    if (!selection) return;
    const els: HTMLElement[] = [];
    for (let i = selection.start; i <= selection.end; i++) cells(i).forEach((c) => { c.classList.add('sel'); els.push(c); });
    return () => els.forEach((c) => c.classList.remove('sel'));
  }, [selection, cells, cols]);

  const moveTo = (i: number, extend = false) => {
    const n = Math.max(0, Math.min(dump.bytes.length - 1, i));
    setCursor(n);
    setActive(fieldAt(fieldOf, n));
    if (select && onSelect) {
      if (!extend || anchor.current === null) anchor.current = n;
      onSelect({ start: Math.min(anchor.current, n), end: Math.max(anchor.current, n) });
    }
    cells(n)[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const byteFrom = (e: MouseEvent) => {
    const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i;
    return i === undefined ? null : Number(i);
  };

  const onMove = (e: MouseEvent) => {
    const i = byteFrom(e);
    if (i === null) return;
    setCursor(i);
    setActive(fieldAt(fieldOf, i));
    if (select && dragging.current && anchor.current !== null && onSelect) {
      onSelect({ start: Math.min(anchor.current, i), end: Math.max(anchor.current, i) });
    }
  };

  const onDown = (e: MouseEvent) => {
    const i = byteFrom(e);
    if (i === null || !select) return;
    e.preventDefault();
    grid.current?.focus();
    dragging.current = true;
    moveTo(i, e.shiftKey);
  };

  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const jumpField = (dir: 1 | -1) => {
    if (!dump.fields.length) return;
    const order = dump.fields.map((f, k) => ({ k, at: f.offset - dump.base })).sort((a, b) => a.at - b.at);
    const here = cursor ?? -1;
    const next = dir > 0 ? order.find((o) => o.at > here) ?? order[0] : [...order].reverse().find((o) => o.at < here) ?? order[order.length - 1];
    moveTo(next.at);
  };

  const onKey = (e: KeyboardEvent) => {
    const c = cursor ?? 0;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, PageDown: cols * 8, PageUp: -cols * 8 };
    if (e.key in step) { e.preventDefault(); moveTo(cursor === null ? 0 : c + step[e.key], e.shiftKey); }
    else if (e.key === 'Home') { e.preventDefault(); moveTo(c - ((c + dump.base) % cols), e.shiftKey); }
    else if (e.key === 'End') { e.preventDefault(); moveTo(c - ((c + dump.base) % cols) + cols - 1, e.shiftKey); }
    else if (e.key === 'n' || e.key === ']') { e.preventDefault(); jumpField(1); }
    else if (e.key === 'p' || e.key === '[') { e.preventDefault(); jumpField(-1); }
    else if (e.key === 'Escape') { setCursor(null); setActive(-1); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatXxd(dump.bytes, dump.base));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const gridEl = useMemo(() => <Grid dump={dump} cols={cols} fieldOf={fieldOf} />, [dump, cols, fieldOf]);
  const field = active >= 0 ? dump.fields[active] : null;
  const off = cursor !== null ? dump.base + cursor : null;

  return (
    <figure className={`panel hexview${select ? ' selecting' : ''}`} ref={wrap}>
      <div className="panel-bar">
        <span>hexdump{dump.title && <> · <b>{dump.title}</b></>}</span>
        <button type="button" className="copy" onClick={copy}>{copied ? t('code.copied') : t('code.copy')}</button>
      </div>
      <div className="hx-scroll">
        <div
          ref={grid}
          className="hx-grid"
          tabIndex={0}
          role="group"
          aria-label={t('hex.label')}
          aria-describedby={undefined}
          onMouseOver={onMove}
          onMouseDown={onDown}
          onMouseLeave={() => { if (!select) { setCursor(null); setActive(-1); } }}
          onKeyDown={onKey}
        >
          {gridEl}
        </div>
      </div>

      <div className="hx-info" aria-live="polite">
        {off === null ? (
          <span className="muted">{t(select ? 'hex.hintSelect' : 'hex.hint')}</span>
        ) : (
          <>
            <span className="hx-at"><b>0x{hex(off, 4)}</b> <span className="muted">({off})</span> = <b>0x{hex(dump.bytes[cursor!])}</b></span>
            {field ? (
              <span className="hx-field">
                <i className={`sw c${active % 8}`} aria-hidden="true" />
                <b>{field.name}</b>
                <span className="muted"> 0x{hex(field.offset, 4)}–0x{hex(field.offset + field.length - 1, 4)} · {field.length} {t(field.length === 1 ? 'hex.byte' : 'hex.bytes')}</span>
                {field.note && <span className="hx-note">{field.note}</span>}
                <span className="hx-values">
                  {fieldValues(dump, field).map((v) => <span key={v.label}><span className="muted">{v.label}</span> <code>{v.value}</code></span>)}
                </span>
              </span>
            ) : <span className="muted">{t('hex.noField')}</span>}
          </>
        )}
      </div>

      {dump.fields.length > 0 && (
        <ul className="hx-legend">
          {dump.fields.map((f, k) => (
            <li key={`${f.offset}-${f.name}`}>
              <button type="button" className={k === active ? 'on' : ''}
                onMouseEnter={() => setActive(k)}
                onFocus={() => setActive(k)}
                onClick={() => { moveTo(f.offset - dump.base); grid.current?.focus(); onFieldClick?.(f); }}>
                <i className={`sw c${k % 8}`} aria-hidden="true" />{f.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
