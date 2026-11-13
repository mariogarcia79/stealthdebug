import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminAPI, { type Agent, type ChangeKind, type ChangeRequestSummary, type ChangeStatus } from '../../api/admin.api';
import { isoDateTime } from '../../utils/format';
import AdminLayout, { StatusBadge } from './AdminLayout';

const KINDS: { kind: ChangeKind; label: string }[] = [
  { kind: 'edit', label: 'Edits' }, { kind: 'new', label: 'New posts' }, { kind: 'translation', label: 'Translations' },
];
const STATUSES: (ChangeStatus | '')[] = ['open', 'outdated', 'declined', 'accepted', 'closed', ''];

// /admin/changes: agents' change requests by kind, filtered by status and
// agent (kept in the URL, so a filtered list can be bookmarked)
export default function ChangeRequestList() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as ChangeKind) || 'edit';
  const status = (params.has('status') ? params.get('status') : 'open') as ChangeStatus | '';
  const agent = params.get('agent') ?? '';
  const [list, setList] = useState<ChangeRequestSummary[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState('');

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };

  useEffect(() => { AdminAPI.agents().then(setAgents).catch(() => {}); }, []);
  useEffect(() => {
    setList(null);
    setError('');
    AdminAPI.changeRequests({ kind, status, agent: agent || undefined })
      .then(setList)
      .catch((e) => setError(String(e.message)));
  }, [kind, status, agent]);

  return (
    <AdminLayout title="Change requests" lead="What agents propose. Nothing reaches the site until you accept it.">
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Kind">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" role="tab" aria-selected={kind === k.kind} onClick={() => setParam('kind', k.kind)}>{k.label}</button>
          ))}
        </div>
        <span className="grow" />
        <label>status
          <select className="select" value={status} onChange={(e) => setParam('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'any'}</option>)}
          </select>
        </label>
        <label>agent
          <select className="select" value={agent} onChange={(e) => setParam('agent', e.target.value)}>
            <option value="">any</option>
            {agents.map((a) => <option key={a._id} value={a._id}>{a.name}{a.deletedAt ? ' (removed)' : ''}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="alert error" role="alert">{error}</p>}
      <div className="panel table-wrap">
        {list === null && !error && <p className="empty-state loading">loading</p>}
        {list?.length === 0 && (
          <div className="empty-state"><b>Nothing here.</b>No {status || ''} {KINDS.find((k) => k.kind === kind)?.label.toLowerCase()} from agents.</div>
        )}
        {list && list.length > 0 && (
          <table className="table cards">
            <thead><tr><th>request</th><th>agent</th><th>status</th><th className="num">rev.</th><th>updated</th></tr></thead>
            <tbody>
              {list.map((cr) => (
                <tr key={cr._id}>
                  <td className="name">
                    <Link to={`/admin/changes/${cr._id}`}>{cr.title ?? '(untitled)'}</Link>
                    {cr.kind === 'translation' && cr.lang && <span className="cr-kind-lang">→ {cr.lang}</span>}
                    <span className="sub" title={cr.description}>{cr.description}</span>
                  </td>
                  <td data-label="agent">{cr.agent.name}</td>
                  <td data-label="status"><StatusBadge status={cr.status} /></td>
                  <td data-label="revisions" className="num">{cr.revisions}</td>
                  <td data-label="updated" className="nowrap muted">{isoDateTime(cr.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
