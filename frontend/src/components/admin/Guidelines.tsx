import { useEffect, useState } from 'react';
import AdminAPI, { type Guidelines as G } from '../../api/admin.api';
import MarkdownRenderer from '../blog/MarkdownRenderer';
import AdminLayout, { when } from './AdminLayout';

// /admin/guidelines: the writing guidelines agents read (style://guidelines), versioned
export default function Guidelines() {
  const [g, setG] = useState<G | null>(null);
  const [content, setContent] = useState('');
  const [old, setOld] = useState<{ version: number; content: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => AdminAPI.guidelines().then((r) => { setG(r); setContent(r.content); }).catch((e) => setError(String(e.message)));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError(''); setMsg('');
    try { const r = await AdminAPI.saveGuidelines(content); setMsg(`Saved as version ${r.version}.`); load(); }
    catch (e) { setError(String((e as Error).message)); }
  };

  return (
    <AdminLayout title="Guidelines" lead="Tone, terminology, notation and structure. Agents read them before proposing anything.">
      {error && <div className="alert error admin-section" role="alert">{error}</div>}
      {msg && <div className="alert ok admin-section" role="status">{msg}</div>}
      {!g && !error && <p className="empty-state loading">loading</p>}
      {g && (
        <div className="guidelines">
          <section className="panel">
            <div className="panel-bar">
              <h2><label htmlFor="guidelines">Markdown</label></h2>
              <span className="muted small">v{g.version}{g.savedAt && ` · ${when(g.savedAt)}`}</span>
              <span className="actions"><button className="btn sm primary" disabled={content === g.content} onClick={save}>save new version</button></span>
            </div>
            <textarea id="guidelines" className="input mono" value={content} onChange={(e) => setContent(e.target.value)} />
          </section>
          <section className="panel">
            <div className="panel-bar"><h2>Preview</h2></div>
            <div className="preview"><MarkdownRenderer content={content} /></div>
          </section>
          <section className="panel history">
            <div className="panel-bar"><h2>History</h2></div>
            {g.history.length === 0 ? <p className="diff-unchanged">No earlier versions.</p> : (
              <ol className="timeline">{g.history.map((h) => (
                <li key={h.version}>
                  <button className="link" onClick={() => AdminAPI.guidelinesVersion(h.version).then(setOld)}>version {h.version}</button>
                  <span className="when">{h.savedBy?.name ?? '?'} · {when(h.createdAt)}</span>
                </li>
              ))}</ol>
            )}
            {old && (
              <div className="old">
                <div className="row-actions">
                  <b>version {old.version}</b>
                  <button className="btn sm" onClick={() => setContent(old.content)}>load into editor</button>
                  <button className="btn sm" onClick={() => setOld(null)}>close</button>
                </div>
                <pre>{old.content}</pre>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
