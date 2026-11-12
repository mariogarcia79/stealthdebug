import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminAPI, { type AuditEntry, type Agent } from '../../api/admin.api';
import { AdminHead, when } from './AdminNav';

const EVENTS = ['', 'tool_call', 'review', 'grant_approved', 'grant_denied', 'token_refreshed', 'token_revoked', 'tokens_revoked', 'agent_registered', 'agent_deleted'];

// /admin/logs: audit log (kept 30 days), newest first, 100 per page
export default function AuditLog() {
  const [event, setEvent] = useState('');
  const [agent, setAgent] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { AdminAPI.agents().then(setAgents).catch(() => {}); }, []);
  useEffect(() => { document.title = 'Audit log · stealthdebug'; return () => { document.title = 'stealthdebug'; }; }, []);

  const fetchPage = (before?: string) =>
    AdminAPI.audit({ event: event || undefined, agent: agent || undefined, before })
      .then((r) => { setEntries((e) => (before ? [...e, ...r] : r)); setMore(r.length === 100); })
      .catch((e) => setError(String(e.message)));
  useEffect(() => { fetchPage(); }, [event, agent]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="wrap admin">
      <AdminHead title="Audit log" lead="Every agent call, review decision and OAuth event of the last 30 days." />
      <div className="cr-filters">
        <label>event{' '}
          <select className="input sm" value={event} onChange={(e) => setEvent(e.target.value)}>
            {EVENTS.map((e) => <option key={e} value={e}>{e || 'any'}</option>)}
          </select>
        </label>
        <label>agent{' '}
          <select className="input sm" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">any</option>
            {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="table-wrap">
        <table className="table audit">
          <thead><tr><th>when</th><th>event</th><th>agent</th><th>admin</th><th>tool</th><th>target</th><th>outcome</th><th>detail</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e._id}>
                <td className="muted">{when(e.at)}</td>
                <td>{e.event}</td>
                <td>{e.agentName ?? ''}</td>
                <td>{e.adminName ?? ''}</td>
                <td>{e.tool ?? ''}</td>
                <td>
                  {e.changeRequest && <Link to={`/admin/changes/${e.changeRequest}`}>request</Link>}{' '}
                  {e.post && <Link to={`/blog/${e.post}`}>post</Link>}
                </td>
                <td className={e.outcome === 'ok' ? '' : 'bad'}>{e.outcome}</td>
                <td className="pre-wrap">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length === 0 && !error && <p className="muted">Nothing logged.</p>}
      {more && <button className="btn sm" onClick={() => fetchPage(entries[entries.length - 1].at)}>older</button>}
    </div>
  );
}
