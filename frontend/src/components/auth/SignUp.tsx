import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthAPI from '../../api/auth.api';
import { validateSignup, MIN_PASSWORD_LENGTH } from '../../utils/validation';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';

// First layer of the data protection information (GDPR art. 13, LOPDGDD art. 11):
// the essentials right where the data is collected, with the full policy linked.
const NOTICE: [MessageKey, MessageKey][] = [
  ['auth.notice.controller', 'auth.notice.controllerV'],
  ['auth.notice.purpose', 'auth.notice.purposeV'],
  ['auth.notice.basis', 'auth.notice.basisV'],
  ['auth.notice.recipients', 'auth.notice.recipientsV'],
  ['auth.notice.rights', 'auth.notice.rightsV'],
];

function DataNotice() {
  const { t } = useI18n();
  return (
    <section className="data-notice" aria-labelledby="data-notice-title">
      <h2 id="data-notice-title">{t('auth.notice.title')}</h2>
      <dl>
        {NOTICE.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{t(k)}</dt><dd>{t(v)}</dd>
          </div>
        ))}
        <dt>{t('auth.notice.more')}</dt>
        <dd><Link to="/privacy">{t('auth.notice.moreV')}</Link></dd>
      </dl>
    </section>
  );
}

function SignUp() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { t } = useI18n();
  const isAdmin = role === 'admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    const clientError = validateSignup(name, email, password);
    if (clientError) { setError(t(clientError.key, clientError.vars)); return; }
    if (!isAdmin && !accepted) { setError(t('auth.acceptRequired')); return; }
    try {
      setLoading(true);
      setError('');
      if (isAdmin) await AuthAPI.signUpAdmin(name.trim(), email.trim(), password, role);
      else await AuthAPI.signUp(name.trim(), email.trim(), password);
      navigate(isAdmin ? '/users' : '/login');
    } catch (err: any) {
      setError(String(err?.message || t('auth.signupFailed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap auth signup">
      <div className="panel">
        <div className="panel-bar"><span><span className="dot" />auth@stealthdebug</span><span>tty1</span></div>
        <form onSubmit={handleSignup} noValidate>
          <div className="eyebrow"><span className="p">$</span> <span className="c">{isAdmin ? 'useradd --admin' : 'useradd'}</span></div>
          <h1>{isAdmin ? t('auth.adminTitle') : t('auth.signupTitle')}</h1>
          <p>{isAdmin ? t('auth.adminLead') : t('auth.signupLead')}</p>
          <div className="field">
            <label htmlFor="name">{t('auth.name')}</label>
            <input id="name" className="input" autoComplete="username" value={name}
              onChange={(e) => setName(e.target.value)} disabled={loading} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="email">{t('auth.email')}</label>
            <input id="email" className="input" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={loading} />
          </div>
          <div className="field">
            <label htmlFor="password">{t('auth.password')}</label>
            <input id="password" className="input" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} disabled={loading} />
            <span className="hint">{t('auth.passwordHint', { n: MIN_PASSWORD_LENGTH })}</span>
          </div>
          {!isAdmin && (
            <label className="check">
              <input id="accept" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={loading} />
              <span>
                {t('auth.accept1')}
                <Link to="/terms" target="_blank">{t('auth.acceptTerms')}</Link>
                {t('auth.accept2')}
                <Link to="/privacy" target="_blank">{t('auth.acceptPrivacy')}</Link>
                {t('auth.accept3')}
              </span>
            </label>
          )}
          {error && <div className="alert error" role="alert">{error}</div>}
          <button type="submit" className="btn primary block" disabled={loading || (!isAdmin && !accepted)}>
            {loading ? t('auth.creating') : isAdmin ? t('auth.adminButton') : t('auth.signupButton')}
          </button>
          {!isAdmin && <div className="alt">{t('auth.haveAccount')} <Link to="/login">{t('nav.login')}</Link></div>}
        </form>
        {!isAdmin && <DataNotice />}
      </div>
    </div>
  );
}

export default SignUp;
