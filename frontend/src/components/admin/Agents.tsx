import { Fragment, useCallback, useEffect, useState } from 'react';
import AdminAPI, { type Agent, type Registered } from '../../api/admin.api';
import AdminLayout, { when } from './AdminLayout';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="icon-btn" aria-label="Copy" title="Copy"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      <Icon name={done ? 'check' : 'copy'} />
    </button>
  );
}

// /admin/agents: register agents (secret shown once), see grants, revoke, remove
export default function Agents() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [name, setName] = useState('');
  const [uris, setUris] = useState('');
  const [created, setCreated] = useState<Registered | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(() => { AdminAPI.agents().then(setAgents).catch((e) => setError(String(e.message))); }, []);
  useEffect(load, [load]);

  const run = async (f: () => Promise<unknown>) => {
    setError('');
    try { await f(); load(); } catch (e) { setError(String((e as Error).message)); }
  };

  return (
    <AdminLayout title="Agents" lead="AI agents that can read posts and propose changes through the MCP server.">
      {error && <div className="alert error admin-section" role="alert">{error}</div>}
      <div className="agents-grid">
        <div>
          {agents === null && !error && <p className="empty-state loading">loading</p>}
          {agents?.length === 0 && <div className="panel empty-state"><b>No agents yet.</b>Register one to connect it.</div>}
          {agents?.map((a) => (
            <section key={a._id} className={`panel agent-card${a.deletedAt ? ' removed' : ''}`}>
              <div className="panel-bar">
                <h2>{a.name}</h2>
                <span className="actions">
                  {a.deletedAt ? <Badge>removed {when(a.deletedAt)}</Badge>
                    : <Badge tone={a.grants.length ? 'ok' : 'neutral'}>{a.grants.length ? `${a.grants.length} active grant${a.grants.length > 1 ? 's' : ''}` : 'not connected'}</Badge>}
                </span>
              </div>
              <div className="panel-body">
                <dl className="facts">
                  <dt>registered</dt><dd>{when(a.createdAt)}</dd>
                  {a.clients.map((c) => (
                    <Fragment key={c._id}><dt>client{c.revokedAt ? ' (revoked)' : ''}</dt>
                      <dd><code>{c.clientId}</code><br />{c.redirectUris.map((u) => <code key={u} className="muted">{u} </code>)}</dd></Fragment>
                  ))}
                </dl>
                <div>
                  <h3>Active grants</h3>
                  {a.grants.length === 0 ? <p className="muted small">No active grants: the agent hasn't been approved, or its tokens were revoked.</p> : (
                    <ul className="grants">{a.grants.map((g) => (
                      <li key={g._id}><code>{g.scopes.join(' ')}</code> <span className="muted">· approved by {g.approvedBy?.name ?? '?'} {when(g.createdAt)} · last used {when(g.lastUsedAt)}</span></li>
                    ))}</ul>
                  )}
                </div>
                {!a.deletedAt && (confirm === a._id ? (
                  <div className="confirm">
                    <span>Remove {a.name}? Its tokens and clients are revoked and open requests closed; its posts keep the name.</span>
                    <button className="btn sm danger" onClick={() => { setConfirm(null); run(() => AdminAPI.removeAgent(a._id)); }}>yes, remove</button>
                    <button className="btn sm" onClick={() => setConfirm(null)}>cancel</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <button className="btn sm" disabled={a.grants.length === 0} onClick={() => run(() => AdminAPI.revoke(a._id))}>revoke all tokens</button>
                    <button className="btn sm danger" onClick={() => setConfirm(a._id)}>remove agent</button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside>
          {created && (
            <section className="panel secret" role="status">
              <div className="panel-bar"><h2>Copy the secret now</h2></div>
              <div className="panel-body">
                <p className="small"><b>{created.agent.name}</b> is registered. The client secret is not shown again.</p>
                <div><label>client ID</label><div className="value"><code>{created.clientId}</code><CopyButton text={created.clientId} /></div></div>
                <div><label>client secret</label><div className="value"><code>{created.clientSecret}</code><CopyButton text={created.clientSecret} /></div></div>
                <button className="btn sm" onClick={() => setCreated(null)}>I've copied it</button>
              </div>
            </section>
          )}
          <section className="panel register">
            <div className="panel-bar"><h2>Register an agent</h2></div>
            <div className="panel-body">
              <form onSubmit={(e) => {
                e.preventDefault();
                const list = uris.split(/\s+/).filter(Boolean);
                run(async () => { setCreated(await AdminAPI.register(name.trim(), list.length ? list : undefined)); setName(''); setUris(''); });
              }}>
                <div className="field">
                  <label htmlFor="agent-name">name</label>
                  <input id="agent-name" className="input" value={name} maxLength={50} placeholder="Claude" onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="agent-uris">redirect URIs</label>
                  <textarea id="agent-uris" className="input mono" rows={3} value={uris} onChange={(e) => setUris(e.target.value)} />
                  <span className="hint">One per line. Empty: Claude's connector callback.</span>
                </div>
                <button className="btn primary" disabled={!name.trim()}>register</button>
              </form>
            </div>
          </section>
        </aside>
      </div>
    </AdminLayout>
  );
}
