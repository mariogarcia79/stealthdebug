import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useI18n, LangSwitch } from '../../i18n';

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);

function Search({ onDone, hotkey = false }: { onDone?: () => void; hotkey?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const { t } = useI18n();
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
      <label className="visually-hidden" htmlFor="nav-search">{t('nav.search')}</label>
      <input
        id="nav-search"
        ref={input}
        className="input"
        type="search"
        placeholder={t('nav.searchPlaceholder')}
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
  const { t } = useI18n();
  const isAdmin = isLoggedIn && role === 'admin';

  useEffect(() => setOpen(false), [location.pathname]);

  const links = (
    <>
      <NavLink to="/" end className={linkClass}>{t('nav.home')}</NavLink>
      <NavLink to="/blog" className={linkClass}>{t('nav.blog')}</NavLink>
      {isAdmin && <NavLink to="/users" className={linkClass}>{t('nav.users')}</NavLink>}
      {isLoggedIn && <NavLink to="/dashboard" className={linkClass}>{t('nav.account')}</NavLink>}
    </>
  );

  const account = isLoggedIn ? (
    <>
      {isAdmin && <Link to="/blog/new" className="btn sm">{t('nav.newPost')}</Link>}
      <button type="button" onClick={logout}>{t('nav.logout')}</button>
    </>
  ) : (
    <>
      <NavLink to="/login" className={linkClass}>{t('nav.login')}</NavLink>
      <Link to="/signup" className="btn sm">{t('nav.signup')}</Link>
    </>
  );

  return (
    <header className="nav">
      <div className="wrap">
        <Link to="/" className="brand" aria-label={t('nav.homeLabel')}>
          <span className="mark" aria-hidden="true">sd</span>
          <span>stealth<span className="slash">/</span>debug<span className="cursor" aria-hidden="true" /></span>
        </Link>
        <nav className="nav-links" aria-label={t('nav.main')}>{links}</nav>
        <div className="nav-right">
          <Search hotkey />
          <LangSwitch />
          {account}
        </div>
        <button
          type="button"
          className="nav-burger"
          aria-label={t('nav.menu')}
          aria-expanded={open}
          aria-controls="nav-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <i />
        </button>
      </div>
      <nav id="nav-menu" className={`nav-menu ${open ? 'open' : ''}`} aria-label={t('nav.menu')}>
        <Search onDone={() => setOpen(false)} />
        {links}
        {account}
        <LangSwitch />
      </nav>
    </header>
  );
}

export default Navbar;
