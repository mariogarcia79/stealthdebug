import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);

function Search({ onDone, hotkey = false }: { onDone?: () => void; hotkey?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses the search box, as on most developer sites
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);

  useEffect(() => { if (!location.pathname.startsWith('/blog')) setQ(''); }, [location.pathname]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/blog?q=${encodeURIComponent(term)}` : '/blog');
    input.current?.blur();
    onDone?.();
  };

  return (
    <form className="nav-search" role="search" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="nav-search">Search posts</label>
      <input
        id="nav-search"
        ref={input}
        className="input"
        type="search"
        placeholder="search posts…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}

function Navbar() {
  const { role, isLoggedIn, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isAdmin = isLoggedIn && role === 'admin';

  useEffect(() => setOpen(false), [location.pathname]);

  const links = (
    <>
      <NavLink to="/" end className={linkClass}>home</NavLink>
      <NavLink to="/blog" className={linkClass}>blog</NavLink>
      {isAdmin && <NavLink to="/users" className={linkClass}>users</NavLink>}
      {isLoggedIn && <NavLink to="/dashboard" className={linkClass}>account</NavLink>}
    </>
  );

  const account = isLoggedIn ? (
    <>
      {isAdmin && <Link to="/blog/new" className="btn sm">new post</Link>}
      <button type="button" onClick={logout}>log out</button>
    </>
  ) : (
    <>
      <NavLink to="/login" className={linkClass}>log in</NavLink>
      <Link to="/signup" className="btn sm">sign up</Link>
    </>
  );

  return (
    <header className="nav">
      <div className="wrap">
        <Link to="/" className="brand" aria-label="stealthdebug home">
          <span className="mark" aria-hidden="true">sd</span>
          <span>stealth<span className="slash">/</span>debug<span className="cursor" aria-hidden="true" /></span>
        </Link>
        <nav className="nav-links" aria-label="Main">{links}</nav>
        <div className="nav-right">
          <Search hotkey />
          {account}
        </div>
        <button
          type="button"
          className="nav-burger"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="nav-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <i />
        </button>
      </div>
      <nav id="nav-menu" className={`nav-menu ${open ? 'open' : ''}`} aria-label="Menu">
        <Search onDone={() => setOpen(false)} />
        {links}
        {account}
      </nav>
    </header>
  );
}

export default Navbar;
