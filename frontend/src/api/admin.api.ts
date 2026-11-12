import { API_BASE_URL } from '../constants/constants';

// Admin API for agents: change requests, agents, guidelines, audit log.
// Every change carries the CSRF token of this session (X-CSRF-Token).

export type ChangeKind = 'edit' | 'new' | 'translation';
export type ChangeStatus = 'open' | 'outdated' | 'declined' | 'accepted' | 'closed';

export interface ProposedFields { title?: string; summary?: string; content?: string; tags?: string[]; series?: string }
export interface Review { by: string | null; byName: string | null; at: string | null; decision: 'accepted' | 'declined' | null; comment: string }
export interface Revision { fields: ProposedFields; description: string; baseHash: string | null; createdAt: string; review: Review | null }

export interface ChangeRequestSummary {
  _id: string; kind: ChangeKind; status: ChangeStatus; agent: { _id: string; name: string }; lang: string | null;
  post: { _id: string; title: string | null } | null; title: string | null; description: string; revisions: number;
  createdAt: string; updatedAt: string;
}

export interface ChangeRequest {
  _id: string; kind: ChangeKind; status: ChangeStatus; agent: { _id: string; name: string };
  post: string | null; lang: string | null; revisions: Revision[]; review: Review | null; resultPost: string | null;
  createdAt: string; updatedAt: string;
}

export interface TargetPost {
  _id: string; title: string; summary: string; content: string; tags: string[]; series: string;
  lang: string; published: boolean; translationOf: string | null; mcpVisible: boolean; updatedAt: string;
  contentHash: string; translations: { _id: string; lang: string }[];
}

export interface Agent {
  _id: string; name: string; createdAt: string; deletedAt: string | null;
  clients: { _id: string; clientId: string; name: string; redirectUris: string[]; revokedAt: string | null; createdAt: string }[];
  grants: { _id: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; approvedBy: { name: string } | null }[];
}

export interface Registered { agent: { _id: string; name: string }; clientId: string; clientSecret: string; redirectUris: string[] }

export interface AuditEntry {
  _id: string; at: string; event: string; tool: string | null; outcome: string; detail: string;
  agent: string | null; agentName: string | null; admin: string | null; adminName: string | null;
  post: string | null; changeRequest: string | null;
}

export interface Guidelines {
  version: number; content: string; savedAt: string | null;
  history: { version: number; createdAt: string; savedBy: { name: string } | null }[];
}

let csrf: string | null = null;

async function call<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  if (method !== 'GET' && !csrf) {
    const r = await fetch(`${API_BASE_URL}/admin/csrf`, { credentials: 'include' });
    if (!r.ok) throw new Error('Not authorized');
    csrf = (await r.json()).csrf;
  }
  const response = await fetch(`${API_BASE_URL}/admin${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrf ?? '' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 403 && method !== 'GET' && retry) {
    csrf = null;   // session changed (logged in again): get a fresh token once
    return call<T>(method, path, body, false);
  }
  if (!response.ok) {
    let message = response.statusText;
    try { message = (await response.json()).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const q = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return p ? `?${p}` : '';
};

const AdminAPI = {
  changeRequests: (f: { kind?: ChangeKind; status?: ChangeStatus | ''; agent?: string }) =>
    call<ChangeRequestSummary[]>('GET', `/change-requests${q({ kind: f.kind, status: f.status || undefined, agent: f.agent })}`),
  changeRequest: (id: string) => call<{ changeRequest: ChangeRequest; target: TargetPost | null }>('GET', `/change-requests/${id}`),
  accept: (id: string, revision: number, publish?: boolean) => call<ChangeRequest>('POST', `/change-requests/${id}/accept`, { revision, publish }),
  decline: (id: string, comment: string) => call<ChangeRequest>('POST', `/change-requests/${id}/decline`, { comment }),
  agents: () => call<Agent[]>('GET', '/agents'),
  register: (name: string, redirectUris?: string[]) => call<Registered>('POST', '/agents', { name, redirectUris }),
  revoke: (id: string) => call<{ revoked: number }>('POST', `/agents/${id}/revoke`),
  removeAgent: (id: string) => call<void>('DELETE', `/agents/${id}`),
  guidelines: () => call<Guidelines>('GET', '/guidelines'),
  guidelinesVersion: (v: number) => call<{ version: number; content: string; savedAt: string }>('GET', `/guidelines/${v}`),
  saveGuidelines: (content: string) => call<{ version: number }>('PUT', '/guidelines', { content }),
  audit: (f: { event?: string; agent?: string; before?: string }) =>
    call<AuditEntry[]>('GET', `/audit${q({ event: f.event, agent: f.agent, before: f.before, limit: '100' })}`),
};

export default AdminAPI;
