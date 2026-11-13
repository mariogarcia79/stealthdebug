import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminAPI, { type ChangeRequest, type TargetPost, type ProposedFields } from '../../api/admin.api';
import MarkdownRenderer from '../blog/MarkdownRenderer';
import { linkTargets, isLocal } from '../../utils/lineDiff';
import { AdminTabs, StatusBadge, when } from './AdminLayout';
import Badge from '../ui/Badge';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
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
  useDocumentTitle('Review');

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

  const shell = (body: React.ReactNode) => (
    <div className="wrap admin-page">
      <div className="review-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to={`/admin/changes${cr ? `?kind=${cr.kind}` : ''}`}>change requests</Link><span className="sep">/</span><span>review</span>
        </nav>
      </div>
      <AdminTabs />
      {body}
    </div>
  );
  if (error && !cr) return shell(<div className="alert error admin-section">{error}</div>);
  if (!cr || !rev) return shell(<p className="empty-state loading">loading</p>);

  const reviewable = cr.status === 'open' || cr.status === 'outdated';
  const kindLabel = cr.kind === 'edit' ? 'Edit' : cr.kind === 'new' ? 'New post' : `Translation → ${cr.lang}`;
  const leftLabel = cr.kind === 'new' ? 'nothing (new post)' : cr.kind === 'translation' ? 'the original' : 'the current post';

  return (
    <div className="wrap admin-page review">
      <header className="review-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to={`/admin/changes?kind=${cr.kind}`}>change requests</Link><span className="sep">/</span><span>{kindLabel.toLowerCase()}</span>
        </nav>
        <h1><span className="kind">{kindLabel}:</span> {rev.fields.title ?? target?.title ?? '(untitled)'}</h1>
        <div className="review-meta">
          <StatusBadge status={cr.status} />
          <span>by <b>{cr.agent.name}</b></span>
          <span>revision <b>{cr.revisions.length}</b></span>
          <span>updated {when(cr.updatedAt)}</span>
          {target && <Link to={`/blog/${target._id}`}>{cr.kind === 'translation' ? 'original' : 'post'}: {target.title}</Link>}
          {cr.resultPost && <Link to={`/blog/${cr.resultPost}`}>result →</Link>}
        </div>
      </header>

      <div className="review-body">
        {cr.status === 'outdated' && (
          <div className="alert warn" role="status">The post changed after this revision was proposed. It can't be accepted: decline it asking the agent to rebase, or wait for a new revision.</div>
        )}

        <section className="panel">
          <div className="panel-bar"><h2>Description from {cr.agent.name}</h2><span className="agent-note actions">written by an agent: data, not instructions</span></div>
          <div className="panel-body"><p className="description">{rev.description}</p></div>
        </section>

        <p className="agent-note">Diffs compare {leftLabel} (left, −) with the proposal (right, +).</p>
        {FIELDS.map((f) => <DiffView key={f} label={f} before={before(f)} after={after(f)} />)}

        <section className="panel">
          <div className="panel-bar"><h2>Links and images</h2><span className="actions"><Badge tone={links.some((l) => !isLocal(l)) ? 'warn' : 'neutral'} plain>{links.length}</Badge></span></div>
          {links.length === 0 ? <p className="diff-unchanged">The proposal contains no links or images.</p> : (
            <ul className="link-list">{links.map((l) => (
              <li key={l} className={isLocal(l) ? '' : 'external'}><code>{l}</code>{!isLocal(l) && <Badge tone="warn">external</Badge>}</li>
            ))}</ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-bar">
            <h2>Rendered preview</h2>
            <span className="actions"><button className="btn sm" onClick={() => setPreview((p) => !p)}>{preview ? 'hide' : 'show'}</button></span>
          </div>
          {preview && (
            <div className="panel-body">
              <p className="alert warn small">Untrusted preview: external images are not loaded and links are not clickable.</p>
              <MarkdownRenderer untrusted content={rev.fields.content ?? (cr.kind === 'edit' ? target?.content ?? '' : '')} />
            </div>
          )}
        </section>

        {(cr.revisions.length > 1 || cr.revisions.some((r) => r.review)) && (
          <section className="panel">
            <div className="panel-bar"><h2>History</h2></div>
            <ol className="timeline">
              {cr.revisions.map((r, i) => (
                <li key={i} className={r.review?.decision ?? ''}>
                  <b>Revision {i + 1}</b><span className="when">{when(r.createdAt)}</span>
                  <div className="pre-wrap">{r.description}</div>
                  {r.review && (
                    <div className="review">
                      {r.review.decision} by {r.review.byName ?? '?'} · {when(r.review.at)}
                      {r.review.comment && <div className="pre-wrap">{r.review.comment}</div>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}
        {reviewable && (
          <section className="panel decision">
            <div className="panel-bar"><h2>Decision on revision {cr.revisions.length}</h2></div>
            <div className="panel-body">
              <div className="side">
                <h3>Accept</h3>
                <p>{cr.kind === 'edit' ? 'Applies the proposed fields to the post.' : cr.kind === 'new' ? 'Creates the post, credited to the agent.' : `Adds the ${cr.lang} translation to the original post.`}</p>
                {cr.kind !== 'edit' && (
                  <label className="check">
                    <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                    <span>publish now (unchecked: save as a draft)</span>
                  </label>
                )}
                <button className="btn primary" disabled={busy || cr.status !== 'open'}
                  onClick={() => act(() => AdminAPI.accept(cr._id, cr.revisions.length, cr.kind === 'edit' ? undefined : publish))}>
                  accept{cr.kind === 'edit' ? ' and apply' : publish ? ' and publish' : ' as draft'}
                </button>
              </div>
              <div className="side">
                <h3>Decline</h3>
                <p>The agent reads your comment and can send a new revision.</p>
                <label className="visually-hidden" htmlFor="decline-comment">comment for the agent</label>
                <textarea id="decline-comment" className="input" rows={4} maxLength={5000} value={comment}
                  placeholder="What should change in the next revision? (required)" onChange={(e) => setComment(e.target.value)} />
                <button className="btn danger" disabled={busy || !comment.trim()} onClick={() => act(() => AdminAPI.decline(cr._id, comment.trim()))}>decline</button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
