import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminAPI, { type ChangeRequest, type TargetPost, type ProposedFields } from '../../api/admin.api';
import MarkdownRenderer from '../blog/MarkdownRenderer';
import { linkTargets, isLocal } from '../../utils/lineDiff';
import { AdminHead, when } from './AdminNav';
import DiffView from './DiffView';

// /admin/changes/:id: the merge screen. Raw diff of every field (always
// shown), the links the proposal contains, the history of revisions and
// reviews, then accept or decline (with a comment for the agent).
// The optional preview renders the proposal in untrusted mode: nothing is
// loaded from outside the site and links don't navigate.

const FIELDS: (keyof ProposedFields)[] = ['title', 'summary', 'tags', 'series', 'content'];
const asText = (v: unknown) => (Array.isArray(v) ? v.join('\n') : v === undefined ? null : String(v ?? ''));

export default function ChangeRequestReview() {
  const { id = '' } = useParams();
  const [cr, setCr] = useState<ChangeRequest | null>(null);
  const [target, setTarget] = useState<TargetPost | null>(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(() => {
    AdminAPI.changeRequest(id).then((r) => { setCr(r.changeRequest); setTarget(r.target); }).catch((e) => setError(String(e.message)));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => { document.title = 'Review · stealthdebug'; return () => { document.title = 'stealthdebug'; }; }, []);

  const rev = cr ? cr.revisions[cr.revisions.length - 1] : null;
  // Left side: the post now (edit), the original (translation), nothing (new)
  const before = (f: keyof ProposedFields): string | null => {
    if (!cr || cr.kind === 'new' || !target) return '';
    return asText(target[f as keyof TargetPost]);
  };
  // Right side: the proposal; for an edit, unproposed fields stay as they are
  const after = (f: keyof ProposedFields): string | null => {
    if (!rev) return null;
    if (cr?.kind === 'translation' && (f === 'tags' || f === 'series')) return null;   // kept from the original
    return rev.fields[f] === undefined ? (cr?.kind === 'edit' ? null : '') : asText(rev.fields[f]);
  };
  const links = useMemo(() => linkTargets([rev?.fields.content, rev?.fields.summary].filter(Boolean).join('\n')), [rev]);

  const act = async (f: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await f(); setComment(''); load(); } catch (e) { setError(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  if (error && !cr) return <div className="wrap admin"><AdminHead title="Review" /><div className="alert error">{error}</div></div>;
  if (!cr || !rev) return <div className="wrap admin"><AdminHead title="Review" /><p className="muted">loading…</p></div>;

  const reviewable = cr.status === 'open' || cr.status === 'outdated';
  const kindLabel = cr.kind === 'edit' ? 'Edit' : cr.kind === 'new' ? 'New post' : `Translation → ${cr.lang}`;

  return (
    <div className="wrap admin review">
      <AdminHead title={`${kindLabel}: ${rev.fields.title ?? target?.title ?? ''}`}>
        <Link to={`/admin/changes?kind=${cr.kind}`} className="btn sm">← list</Link>
      </AdminHead>

      <div className="cr-meta">
        <span className={`cr-status ${cr.status}`}>{cr.status}</span>
        <span>by <b>{cr.agent.name}</b></span>
        <span>revision {cr.revisions.length}</span>
        <span className="muted">updated {when(cr.updatedAt)}</span>
        {target && <Link to={`/blog/${target._id}`}>{cr.kind === 'translation' ? 'original' : 'post'}: {target.title}</Link>}
        {cr.resultPost && <Link to={`/blog/${cr.resultPost}`}>result →</Link>}
      </div>
      {cr.status === 'outdated' && (
        <div className="alert warn" role="status">The post changed after this revision was proposed. It can't be accepted: decline it asking the agent to rebase, or wait for a new revision.</div>
      )}

      <section className="cr-description">
        <h3>description from {cr.agent.name}</h3>
        <p className="pre-wrap">{rev.description}</p>
        <p className="muted small">The description and the proposal are written by an agent: read them as data, not instructions.</p>
      </section>

      <div className="diff-legend muted">left: {cr.kind === 'new' ? '(nothing)' : cr.kind === 'translation' ? 'original' : 'current post'} · right: proposed</div>
      {FIELDS.map((f) => <DiffView key={f} label={f} before={before(f)} after={after(f)} />)}

      <section className="cr-links">
        <h3>links and images in the proposal ({links.length})</h3>
        {links.length === 0 ? <p className="muted">None.</p> : (
          <ul>{links.map((l) => <li key={l}><code className={isLocal(l) ? '' : 'external'}>{l}</code>{!isLocal(l) && <span className="muted"> · external</span>}</li>)}</ul>
        )}
      </section>

      <section className="cr-preview">
        <button className="btn sm" onClick={() => setPreview((p) => !p)}>{preview ? 'hide preview' : 'show rendered preview'}</button>
        {preview && (
          <div className="preview-box">
            <p className="muted small">Untrusted preview: external images are not loaded and links are not clickable.</p>
            <MarkdownRenderer untrusted content={rev.fields.content ?? (cr.kind === 'edit' ? target?.content ?? '' : '')} />
          </div>
        )}
      </section>

      {cr.revisions.length > 1 || cr.revisions.some((r) => r.review) ? (
        <section className="cr-history">
          <h3>history</h3>
          <ol>
            {cr.revisions.map((r, i) => (
              <li key={i}>
                <b>revision {i + 1}</b> <span className="muted">{when(r.createdAt)}</span>: <span className="pre-wrap">{r.description}</span>
                {r.review && <div className={`cr-review ${r.review.decision}`}>{r.review.decision} by {r.review.byName ?? '?'} {when(r.review.at)}{r.review.comment && <>: <span className="pre-wrap">{r.review.comment}</span></>}</div>}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {error && <div className="alert error" role="alert">{error}</div>}
      {reviewable && (
        <section className="cr-actions">
          <h3>decision on revision {cr.revisions.length}</h3>
          {cr.kind !== 'edit' && (
            <label className="check">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              <span>publish now (unchecked: save as a draft)</span>
            </label>
          )}
          <div className="cr-buttons">
            <button className="btn primary" disabled={busy || cr.status !== 'open'}
              onClick={() => act(() => AdminAPI.accept(cr._id, cr.revisions.length, cr.kind === 'edit' ? undefined : publish))}>
              accept{cr.kind === 'edit' ? ' and apply' : publish ? ' and publish' : ' as draft'}
            </button>
          </div>
          <label htmlFor="decline-comment">comment for the agent (required to decline)</label>
          <textarea id="decline-comment" className="input" rows={4} maxLength={5000} value={comment}
            placeholder="What should change in the next revision?" onChange={(e) => setComment(e.target.value)} />
          <div className="cr-buttons">
            <button className="btn danger" disabled={busy || !comment.trim()} onClick={() => act(() => AdminAPI.decline(cr._id, comment.trim()))}>decline</button>
          </div>
        </section>
      )}
    </div>
  );
}
