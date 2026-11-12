import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthAPI from '../../api/auth.api';
import { validateLogin } from '../../utils/validation';
import { useI18n } from '../../i18n';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // ?next=/path: where to go after logging in (e.g. back to an agent's
  // consent page). Same-site paths only, never another origin.
  const nextParam = params.get('next') ?? '';
  const next = /^\/(?![\/\\])/.test(nextParam) ? nextParam : '/blog';
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const clientError = validateLogin(name, password);
    if (clientError) { setError(t(clientError.key, clientError.vars)); return; }
    try {
      setLoading(true);
      setError('');
      await AuthAPI.logIn(name.trim(), password);
      await login();
      navigate(next, { replace: true });
    } catch (err: any) {
      setError(String(err?.response?.data?.message || err?.message || t('auth.loginFailed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap auth">
      <div className="panel">
        <div className="panel-bar"><span><span className="dot" />auth@stealthdebug</span><span>tty1</span></div>
        <form onSubmit={handleLogin} noValidate>
          <div className="eyebrow"><span className="p">$</span> <span className="c">login</span></div>
          <h1>{t('auth.loginTitle')}</h1>
          <p>{t('auth.loginLead')}</p>
          <div className="field">
            <label htmlFor="name">{t('auth.name')}</label>
            <input id="name" className="input" autoComplete="username" value={name}
              onChange={(e) => setName(e.target.value)} disabled={loading} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">{t('auth.password')}</label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} disabled={loading} />
          </div>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button type="submit" className="btn primary block" disabled={loading}>{loading ? t('auth.loggingIn') : t('auth.loginButton')}</button>
          <div className="alt">{t('auth.noAccount')} <Link to="/signup">{t('nav.signup')}</Link></div>
        </form>
      </div>
    </div>
  );
}

export default Login;
