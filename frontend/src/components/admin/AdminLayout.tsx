import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import AdminAPI, { type ChangeStatus } from '../../api/admin.api';
import PageHeader from '../ui/PageHeader';
import Badge, { type Tone } from '../ui/Badge';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { isoDateTime } from '../../utils/format';

// Frame of the agents admin area: the page header and the section tabs.
// Admin-only screens are in English, like the editor.

const TABS = [
  { to: '/admin/changes', label: 'change requests' },
  { to: '/admin/agents', label: 'agents' },
  { to: '/admin/guidelines', label: 'guidelines' },
  { to: '/admin/logs', label: 'audit log' },
];

// Open change requests, shown on the first tab
function useOpenCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => { AdminAPI.changeRequests({ kind: undefined, status: 'open' }).then((l) => setN(l.length)).catch(() => {}); }, []);
  return n;
}

export function AdminTabs() {
  const open = useOpenCount();
  return (
    <nav className="tabs" aria-label="Agents admin">
      {TABS.map((t, i) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          {t.label}{i === 0 && open > 0 && <span className="count" aria-label={`${open} open`}>{open}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

interface Props { title: string; lead?: string; tools?: ReactNode; children: ReactNode }

export default function AdminLayout({ title, lead, tools, children }: Props) {
  useDocumentTitle(title);
  return (
    <div className="wrap admin-page">
      <PageHeader prompt="sudo agents" promptChar="#" title={title} lead={lead}>{tools}</PageHeader>
      <AdminTabs />
      {children}
    </div>
  );
}

// Status of a change request as a badge
const STATUS_TONE: Record<ChangeStatus, Tone> = { open: 'ok', outdated: 'warn', declined: 'warn', accepted: 'neutral', closed: 'neutral' };
export const StatusBadge = ({ status }: { status: ChangeStatus }) => <Badge tone={STATUS_TONE[status]}>{status}</Badge>;

// Compact date for admin tables: "2026-11-13 14:05", or "—"
export const when = (iso: string | null | undefined) => (iso ? isoDateTime(iso) : '—');
