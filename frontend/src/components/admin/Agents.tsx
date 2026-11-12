import { useCallback, useEffect, useState } from 'react';
import AdminAPI, { type Agent, type Registered } from '../../api/admin.api';
import { AdminHead, when } from './AdminNav';

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
  useEffect(() => { document.title = 'Agents · stealthdebug'; return () => { document.title = 'stealthdebug'; }; }, []);

  const run = async (f: () => Promise<unknown>) => {
    setError('');
    try { await f(); load(); } catch (e) { setError(String((e as Error).message)); }
  };

  return (
    <div className="wrap admin">
      <AdminHead title="Agents" lead="AI agents that can read posts and propose changes through the MCP server." />
      {error && <div className="alert error" role="alert">{error}</div>}

      <form className="agent-register" onSubmit={(e) => {
        e.preventDefault();
        const list = uris.split(/\s+/).filter(Boolean);
        run(async () => { setCreated(await AdminAPI.register(name.trim(), list.length ? list : undefined)); setName(''); setUris(''); });
      }}>
        <h3>register an agent</h3>
        <label htmlFor="agent-name">name</label>
        <input id="agent-name" className="input" value={name} maxLength={50} placeholder="Claude" onChange={(e) => setName(e.target.value)} required />
        <label htmlFor="agent-uris">redirect URIs <span className="muted">· one per line; empty = Claude's connector callback</span></label>
        <textarea id="agent-uris" className="input" rows={2} value={uris} onChange={(e) => setUris(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()}>register</button>
      </form>

      {created && (
        <div className="alert warn secret-box" role="status">
          <p><b>{created.agent.name}</b> registered. Copy the client secret now: it is not shown again.</p>
          <dl>
            <dt>client ID</dt><dd><code>{created.clientId}</code></dd>
            <dt>client secret</dt><dd><code>{created.clientSecret}</code></dd>
            <dt>redirect URIs</dt><dd>{created.redirectUris.map((u) => <code key={u}>{u} </code>)}</dd>
          </dl>
          <button className="btn sm" onClick={() => setCreated(null)}>I've copied it</button>
        </div>
      )}

      {agents === null && !error && <p className="muted">loading…</p>}
      {agents?.length === 0 && <p className="muted">No agents yet.</p>}
      {agents?.map((a) => (
        <section key={a._id} className={`agent-card${a.deletedAt ? ' removed' : ''}`}>
          <h3>{a.name} {a.deletedAt && <span className="muted">· removed {when(a.deletedAt)}</span>}</h3>
          <p className="muted small">registered {when(a.createdAt)}</p>
          <h4>clients</h4>
          <ul>{a.clients.map((c) => (
            <li key={c._id}><code>{c.clientId}</code> → {c.redirectUris.map((u) => <code key={u}>{u} </code>)}{c.revokedAt && <span className="muted"> · revoked</span>}</li>
          ))}</ul>
          <h4>active grants</h4>
          {a.grants.length === 0 ? <p className="muted">None.</p> : (
            <ul>{a.grants.map((g) => (
              <li key={g._id}>{g.scopes.join(', ')} · approved by {g.approvedBy?.name ?? '?'} {when(g.createdAt)} · last used {when(g.lastUsedAt)}</li>
            ))}</ul>
          )}
          {!a.deletedAt && (
            <div className="cr-buttons">
              <button className="btn sm" disabled={a.grants.length === 0} onClick={() => run(() => AdminAPI.revoke(a._id))}>revoke all tokens</button>
              {confirm === a._id ? (
                <>
                  <span>Remove {a.name}? Its tokens and clients are revoked and open requests closed; its posts keep the name.</span>
                  <button className="btn sm danger" onClick={() => { setConfirm(null); run(() => AdminAPI.removeAgent(a._id)); }}>yes, remove</button>
                  <button className="btn sm" onClick={() => setConfirm(null)}>cancel</button>
                </>
              ) : <button className="btn sm danger" onClick={() => setConfirm(a._id)}>remove agent</button>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
