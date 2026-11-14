import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import HexViewer, { type Selection } from '../HexViewer';
import { dumpText, hex, parseHexdump, serializeHexdump, type HexField } from '../../../utils/hexdump';

// The editor's hexdump tool: paste xxd / hexdump -C / hex, select byte
// ranges in the viewer and name them. Produces the body of a ```hexdump
// block (utils/hexdump.ts). Opening it with the cursor inside an existing
// block edits that block.

interface Props {
  initial: string;                    // body of the block being edited, or ''
  onSave: (body: string) => void;
  onClose: () => void;
}

export default function HexdumpDialog({ initial, onSave, onClose }: Props) {
  const start = useMemo(() => parseHexdump(initial), [initial]);
  const [title, setTitle] = useState(start.title);
  const [text, setText] = useState(dumpText(initial));
  const [fields, setFields] = useState<HexField[]>(start.fields);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const dialog = useRef<HTMLDivElement>(null);

  // The dump as it is now, with the fields so far (invalid ones reported)
  const body = serializeHexdump(title, text, fields);
  const dump = useMemo(() => parseHexdump(body), [body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    dialog.current?.querySelector<HTMLElement>('textarea, input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sel = selection && dump.bytes.length ? {
    offset: dump.base + selection.start,
    length: selection.end - selection.start + 1,
  } : null;
  const clash = sel && fields.find((f) => sel.offset < f.offset + f.length && f.offset < sel.offset + sel.length);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!sel || !name.trim() || clash) return;
    setFields((fs) => [...fs, { ...sel, name: name.trim(), note: note.trim() }].sort((a, b) => a.offset - b.offset));
    setName(''); setNote(''); setSelection(null);
  };
  const update = (i: number, patch: Partial<HexField>) => setFields((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal hexdump-dialog panel" role="dialog" aria-modal="true" aria-labelledby="hexdump-dialog-title" ref={dialog}>
        <div className="panel-bar">
          <h2 id="hexdump-dialog-title">Hex dump</h2>
          <span className="actions"><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button></span>
        </div>
        <div className="panel-body hexdump-dialog-body">
          <div className="hd-source">
            <div className="field">
              <label htmlFor="hd-title">title <span className="hint">optional</span></label>
              <input id="hd-title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="uImage header" />
            </div>
            <div className="field">
              <label htmlFor="hd-dump">dump <span className="hint">xxd, hexdump -C or plain hex bytes</span></label>
              <textarea id="hd-dump" className="input mono" rows={8} spellCheck={false} value={text}
                placeholder={'00000000: 2705 1956 6a1c 4b2e 51f6 2b3c 0013 2a7c  \'..Vj.K.Q.+<..*|'}
                onChange={(e) => { setText(e.target.value); setSelection(null); }} />
            </div>
            {dump.errors.length > 0 && text.trim() && (
              <ul className="alert warn hd-errors">{dump.errors.slice(0, 6).map((er) => <li key={er}>{er}</li>)}</ul>
            )}
          </div>

          {dump.bytes.length > 0 && (
            <>
              <HexViewer dump={dump} select selection={selection} onSelect={setSelection}
                onFieldClick={(f) => setSelection({ start: f.offset - dump.base, end: f.offset - dump.base + f.length - 1 })} />

              <form className="hd-add" onSubmit={add}>
                <span className="hd-range">
                  {sel ? <>0x{hex(sel.offset, 4)}–0x{hex(sel.offset + sel.length - 1, 4)} · {sel.length} B</> : <span className="muted">select bytes above</span>}
                </span>
                <input className="input sm" aria-label="field name" placeholder="name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                <input className="input sm grow" aria-label="field note" placeholder="note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                <button className="btn sm primary" disabled={!sel || !name.trim() || !!clash}>add field</button>
                {clash && <span className="hd-clash">overlaps “{clash.name}”</span>}
              </form>

              {fields.length > 0 && (
                <table className="table hd-fields">
                  <thead><tr><th>range</th><th>name</th><th>note</th><th /></tr></thead>
                  <tbody>
                    {fields.map((f, i) => (
                      <tr key={`${f.offset}-${i}`}>
                        <td className="nowrap"><code>0x{hex(f.offset, 4)}+{f.length}</code></td>
                        <td><input className="input sm" aria-label="name" value={f.name} maxLength={60} onChange={(e) => update(i, { name: e.target.value })} /></td>
                        <td><input className="input sm" aria-label="note" value={f.note} maxLength={300} onChange={(e) => update(i, { note: e.target.value })} /></td>
                        <td className="actions"><button type="button" className="btn sm danger" onClick={() => setFields((fs) => fs.filter((_, k) => k !== i))}>remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>cancel</button>
          <button type="button" className="btn primary" disabled={!dump.bytes.length || fields.some((f) => !f.name.trim())}
            onClick={() => onSave(body)}>{initial ? 'update block' : 'insert block'}</button>
        </div>
      </div>
    </div>
  );
}

// The ```hexdump block around a position in the editor text, if any
export function hexdumpBlockAt(doc: string, pos: number): { from: number; to: number; body: string } | null {
  const re = /^```hexdump[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    if (pos >= m.index && pos <= m.index + m[0].length) return { from: m.index, to: m.index + m[0].length, body: m[1].replace(/\n$/, '') };
  }
  return null;
}
