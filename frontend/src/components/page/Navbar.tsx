import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useI18n, LangSwitch } from '../../i18n';
import { Menu, MenuLink, MenuItem, MenuSep } from '../ui/Menu';
import ThemeMenu, { ThemeSwitch } from '../ui/ThemeMenu';
import Icon from '../ui/Icon';

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
      const target = e.target as HTMLElement;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
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
      <label className="visually-hidden" htmlFor={hotkey ? 'nav-search' : 'nav-search-menu'}>{t('nav.search')}</label>
      <input
        id={hotkey ? 'nav-search' : 'nav-search-menu'}
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

// Admin tools in one place: writing, users, agents
const ADMIN_LINKS = [
  { to: '/blog/new', key: 'nav.newPost', icon: 'plus' },
  { to: '/users', key: 'nav.users', icon: 'user' },
  { to: '/admin/changes', key: 'nav.agents', icon: 'shield' },
] as const;

function Navbar() {
  const { role, isLoggedIn, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { t } = useI18n();
  const isAdmin = isLoggedIn && role === 'admin';
  const at = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  useEffect(() => setOpen(false), [location.pathname]);

  const links = (
    <>
      <NavLink to="/" end className={linkClass}>{t('nav.home')}</NavLink>
      <NavLink to="/blog" className={linkClass}>{t('nav.blog')}</NavLink>
      <NavLink to="/about" className={linkClass}>{t('nav.about')}</NavLink>
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
          <ThemeMenu />
          {isAdmin && (
            <Menu label={<>{t('nav.admin')}<Icon name="caret" className="caret" /></>}>
              {ADMIN_LINKS.map((l) => <MenuLink key={l.to} to={l.to} icon={l.icon} active={at(l.to)}>{t(l.key)}</MenuLink>)}
            </Menu>
          )}
          {isLoggedIn ? (
            <Menu triggerClassName="icon-btn" ariaLabel={t('nav.account')} label={<Icon name="user" />}>
              <MenuLink to="/dashboard" icon="user" active={at('/dashboard')}>{t('nav.account')}</MenuLink>
              <MenuSep />
              <MenuItem icon="logout" onSelect={logout}>{t('nav.logout')}</MenuItem>
            </Menu>
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>{t('nav.login')}</NavLink>
              <Link to="/signup" className="btn sm">{t('nav.signup')}</Link>
            </>
          )}
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
        <div className="group">
          <Search onDone={() => setOpen(false)} />
          {links}
        </div>
        {isAdmin && (
          <div className="group">
            <span className="group-label">{t('nav.admin')}</span>
            {ADMIN_LINKS.map((l) => <NavLink key={l.to} to={l.to} className={linkClass}>{t(l.key)}</NavLink>)}
          </div>
        )}
        <div className="group">
          {isLoggedIn ? (
            <>
              <NavLink to="/dashboard" className={linkClass}>{t('nav.account')}</NavLink>
              <button type="button" className="nav-item" onClick={logout}>{t('nav.logout')}</button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>{t('nav.login')}</NavLink>
              <NavLink to="/signup" className={linkClass}>{t('nav.signup')}</NavLink>
            </>
          )}
          <div className="settings-row">
            <LangSwitch />
            <ThemeSwitch />
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
