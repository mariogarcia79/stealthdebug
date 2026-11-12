import { useEffect, useState } from 'react';
import AdminAPI, { type Guidelines as G } from '../../api/admin.api';
import MarkdownRenderer from '../blog/MarkdownRenderer';
import { AdminHead, when } from './AdminNav';

// /admin/guidelines: the writing guidelines agents read (style://guidelines), versioned
export default function Guidelines() {
  const [g, setG] = useState<G | null>(null);
  const [content, setContent] = useState('');
  const [old, setOld] = useState<{ version: number; content: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => AdminAPI.guidelines().then((r) => { setG(r); setContent(r.content); }).catch((e) => setError(String(e.message)));
  useEffect(() => { load(); }, []);
  useEffect(() => { document.title = 'Guidelines · stealthdebug'; return () => { document.title = 'stealthdebug'; }; }, []);

  const save = async () => {
    setError(''); setMsg('');
    try { const r = await AdminAPI.saveGuidelines(content); setMsg(`Saved as version ${r.version}.`); load(); }
    catch (e) { setError(String((e as Error).message)); }
  };

  return (
    <div className="wrap admin">
      <AdminHead title="Guidelines" lead="Writing guidelines for agents: tone, terminology, notation, structure. Agents read them before proposing anything." />
      {error && <div className="alert error" role="alert">{error}</div>}
      {msg && <div className="alert" role="status">{msg}</div>}
      {g && (
        <div className="guidelines">
          <div className="guidelines-edit">
            <label htmlFor="guidelines">Markdown · current version {g.version}{g.savedAt && ` · ${when(g.savedAt)}`}</label>
            <textarea id="guidelines" className="input mono" rows={22} value={content} onChange={(e) => setContent(e.target.value)} />
            <button className="btn primary" disabled={content === g.content} onClick={save}>save new version</button>
          </div>
          <div className="guidelines-preview"><MarkdownRenderer content={content} /></div>
          <section className="guidelines-history">
            <h3>history</h3>
            {g.history.length === 0 ? <p className="muted">No versions yet.</p> : (
              <ul>{g.history.map((h) => (
                <li key={h.version}>
                  <button className="link" onClick={() => AdminAPI.guidelinesVersion(h.version).then(setOld)}>version {h.version}</button>
                  <span className="muted"> · {h.savedBy?.name ?? '?'} · {when(h.createdAt)}</span>
                </li>
              ))}</ul>
            )}
            {old && (
              <div className="preview-box">
                <p><b>version {old.version}</b> <button className="btn sm" onClick={() => setContent(old.content)}>load into editor</button> <button className="btn sm" onClick={() => setOld(null)}>close</button></p>
                <pre className="pre-wrap">{old.content}</pre>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
