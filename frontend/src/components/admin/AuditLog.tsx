import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminAPI, { type AuditEntry, type Agent } from '../../api/admin.api';
import AdminLayout, { when } from './AdminLayout';
import Badge from '../ui/Badge';

const EVENTS = ['', 'tool_call', 'review', 'grant_approved', 'grant_denied', 'token_refreshed', 'token_revoked', 'tokens_revoked', 'agent_registered', 'agent_deleted'];

// /admin/logs: audit log (kept 30 days), newest first, 100 per page
export default function AuditLog() {
  const [event, setEvent] = useState('');
  const [agent, setAgent] = useState('');
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { AdminAPI.agents().then(setAgents).catch(() => {}); }, []);

  const fetchPage = (before?: string) =>
    AdminAPI.audit({ event: event || undefined, agent: agent || undefined, before })
      .then((r) => { setEntries((e) => (before && e ? [...e, ...r] : r)); setMore(r.length === 100); })
      .catch((e) => setError(String(e.message)));
  useEffect(() => { setEntries(null); fetchPage(); }, [event, agent]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AdminLayout title="Audit log" lead="Every agent call, review decision and OAuth event of the last 30 days.">
      <div className="toolbar">
        <label>event
          <select className="select" value={event} onChange={(e) => setEvent(e.target.value)}>
            {EVENTS.map((e) => <option key={e} value={e}>{e || 'any'}</option>)}
          </select>
        </label>
        <label>agent
          <select className="select" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">any</option>
            {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="panel table-wrap">
        {entries === null && !error && <p className="empty-state loading">loading</p>}
        {entries?.length === 0 && <div className="empty-state"><b>Nothing logged.</b>No events match these filters.</div>}
        {entries && entries.length > 0 && (
          <table className="table cards audit">
            <thead><tr><th>when</th><th>event</th><th>who</th><th>outcome</th><th>target</th><th>detail</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id}>
                  <td data-label="when" className="when nowrap">{when(e.at)}</td>
                  <td data-label="event" className="nowrap"><code>{e.event}</code>{e.tool && <span className="sub">{e.tool}</span>}</td>
                  <td data-label="who" className="nowrap">{e.agentName ?? e.adminName ?? <span className="muted">—</span>}{e.agentName && e.adminName && <span className="sub">admin: {e.adminName}</span>}</td>
                  <td data-label="outcome"><Badge tone={e.outcome === 'ok' ? 'ok' : 'danger'}>{e.outcome}</Badge></td>
                  <td data-label="target" className="nowrap">
                    <span className="targets">
                      {e.changeRequest && <Link to={`/admin/changes/${e.changeRequest}`}>request</Link>}
                      {e.post && <Link to={`/blog/${e.post}`}>post</Link>}
                      {!e.changeRequest && !e.post && <span className="muted">—</span>}
                    </span>
                  </td>
                  <td data-label="detail" className="detail pre-wrap">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {more && entries && <div className="toolbar"><button className="btn sm" onClick={() => fetchPage(entries[entries.length - 1].at)}>load older</button></div>}
    </AdminLayout>
  );
}
