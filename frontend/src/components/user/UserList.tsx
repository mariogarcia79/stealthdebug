import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../../types/user';
import UsersAPI from '../../api/users.api';
import { useAuth } from '../../context/AuthContext';
import { isoDate } from '../../utils/format';

function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const { _id, role, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (role !== 'admin') { setLoading(false); setError('Unauthorized.'); return; }
    UsersAPI.getAllUsers()
      .then(setUsers)
      .catch(() => setError('Error loading users.'))
      .finally(() => setLoading(false));
  }, [role, isLoading]);

  const remove = async (userId: string) => {
    try {
      await UsersAPI.deleteUserById(userId);
      setUsers((prev) => prev.filter((u) => u._id !== userId));
    } catch {
      setError('Failed to delete the user.');
    } finally {
      setConfirming(null);
    }
  };

  const term = filter.trim().toLowerCase();
  const shown = users.filter((u) => !term || `${u.name} ${u.email}`.toLowerCase().includes(term));

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="p">#</span> <span className="c">cat /etc/passwd</span></div>
          <h1>Users</h1>
          <p>{users.length} accounts.</p>
        </div>
        <div className="tools">
          <input className="input" type="search" placeholder="filter users…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter users" />
          <Link to="/signup" className="btn primary">new admin</Link>
        </div>
      </div>

      {error && <p className="alert error" style={{ marginBottom: 16 }}>{error}</p>}

      {loading ? (
        <p className="empty loading">loading users</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr><th>name</th><th>email</th><th>role</th><th>joined</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u._id}>
                  <td className="name"><Link to={u._id === _id ? '/dashboard' : `/dashboard/${u._id}`}>{u.name}</Link>{u._id === _id && <span className="muted"> (you)</span>}</td>
                  <td className="muted">{u.email}</td>
                  <td><span className={`role ${u.role === 'admin' ? 'admin' : ''}`}>{u.role ?? 'user'}</span></td>
                  <td className="muted">{u.createdAt ? isoDate(u.createdAt) : ''}</td>
                  <td className="actions">
                    {u._id === _id ? null : confirming === u._id ? (
                      <>
                        <button className="btn sm danger" onClick={() => remove(u._id)}>confirm</button>{' '}
                        <button className="btn sm ghost" onClick={() => setConfirming(null)}>cancel</button>
                      </>
                    ) : (
                      <button className="btn sm danger" onClick={() => setConfirming(u._id)}>delete</button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} className="muted">No users match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default UserList;
