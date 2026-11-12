import { NavLink } from 'react-router-dom';

// Tabs of the agents admin area (admin-only screens are in English, like the editor)
export default function AdminNav() {
  const cls = ({ isActive }: { isActive: boolean }) => `admin-tab${isActive ? ' active' : ''}`;
  return (
    <nav className="admin-tabs" aria-label="Agents admin">
      <NavLink to="/admin/changes" className={cls}>change requests</NavLink>
      <NavLink to="/admin/agents" className={cls}>agents</NavLink>
      <NavLink to="/admin/guidelines" className={cls}>guidelines</NavLink>
      <NavLink to="/admin/logs" className={cls}>audit log</NavLink>
    </nav>
  );
}

export function AdminHead({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <>
      <div className="page-head admin-head">
        <div>
          <div className="eyebrow"><span className="p">$</span> <span className="c">agents</span></div>
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
        </div>
        {children && <div className="tools">{children}</div>}
      </div>
      <AdminNav />
    </>
  );
}

export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
