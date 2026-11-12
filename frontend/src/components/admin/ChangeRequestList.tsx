import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminAPI, { type ChangeKind, type ChangeRequestSummary, type ChangeStatus, type Agent } from '../../api/admin.api';
import { AdminHead, when } from './AdminNav';

const KINDS: { kind: ChangeKind; label: string }[] = [
  { kind: 'edit', label: 'Edit' }, { kind: 'new', label: 'New' }, { kind: 'translation', label: 'Translation' },
];
const STATUSES: (ChangeStatus | '')[] = ['open', 'outdated', 'declined', 'accepted', 'closed', ''];

// /admin/changes: agents' change requests by kind, filtered by status and agent
export default function ChangeRequestList() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as ChangeKind) || 'edit';
  const status = (params.has('status') ? params.get('status') : 'open') as ChangeStatus | '';
  const agent = params.get('agent') ?? '';
  const [list, setList] = useState<ChangeRequestSummary[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }); };

  useEffect(() => { AdminAPI.agents().then(setAgents).catch(() => {}); }, []);
  useEffect(() => {
    setList(null);
    AdminAPI.changeRequests({ kind, status, agent: agent || undefined })
      .then(setList).catch((e) => setError(String(e.message)));
  }, [kind, status, agent]);

  useEffect(() => { document.title = 'Change requests · stealthdebug'; return () => { document.title = 'stealthdebug'; }; }, []);

  return (
    <div className="wrap admin">
      <AdminHead title="Change requests" lead="What agents propose. Nothing reaches the site until you accept it." />
      <div className="cr-filters">
        <div className="seg" role="tablist" aria-label="Kind">
          {KINDS.map((k) => (
            <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? 'on' : ''} onClick={() => set('kind', k.kind)}>{k.label}</button>
          ))}
        </div>
        <label>status{' '}
          <select className="input sm" value={status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'any'}</option>)}
          </select>
        </label>
        <label>agent{' '}
          <select className="input sm" value={agent} onChange={(e) => set('agent', e.target.value)}>
            <option value="">any</option>
            {agents.map((a) => <option key={a._id} value={a._id}>{a.name}{a.deletedAt ? ' (removed)' : ''}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      {list === null && !error && <p className="muted">loading…</p>}
      {list?.length === 0 && <p className="muted">No change requests here.</p>}
      {list && list.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>request</th><th>agent</th><th>status</th><th>rev.</th><th>updated</th></tr></thead>
            <tbody>
              {list.map((cr) => (
                <tr key={cr._id}>
                  <td className="name">
                    <Link to={`/admin/changes/${cr._id}`}>{cr.title ?? '(untitled)'}</Link>
                    {cr.kind === 'translation' && cr.lang && <span className="muted"> → {cr.lang}</span>}
                    <div className="muted cr-desc">{cr.description}</div>
                  </td>
                  <td>{cr.agent.name}</td>
                  <td><span className={`cr-status ${cr.status}`}>{cr.status}</span></td>
                  <td>{cr.revisions}</td>
                  <td className="muted">{when(cr.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
