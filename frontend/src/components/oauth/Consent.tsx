import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import OAuthAPI, { OAuthHttpError, type AuthorizationRequest } from '../../api/oauth.api';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';

// /oauth/consent?request=<id>: an admin approves or denies an agent's
// connection (OAuth consent). The backend's /api/oauth/authorize sends the
// browser here; the decision sends it back to the client (claude.ai).
// /oauth/consent?error=<code>: the request couldn't even be started.

const SCOPE_KEYS: Record<string, MessageKey> = {
  'posts:read': 'consent.scope.postsRead',
  'changes:write': 'consent.scope.changesWrite',
};

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; req: AuthorizationRequest }
  | { kind: 'error'; key: MessageKey }
  | { kind: 'leaving' };

function Consent() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const requestId = params.get('request');
  const startError = params.get('error');

  useEffect(() => {
    document.title = `${t('consent.title')} · stealthdebug`;
    return () => { document.title = 'stealthdebug'; };
  }, [t]);

  useEffect(() => {
    if (startError || !requestId) {
      setState({ kind: 'error', key: startError === 'invalid_redirect_uri' ? 'consent.badRedirect' : 'consent.badClient' });
      return;
    }
    OAuthAPI.getRequest(requestId)
      .then((req) => setState({ kind: 'ready', req }))
      .catch((err) => {
        const status = err instanceof OAuthHttpError ? err.status : 0;
        // Not logged in: log in, then come back here
        if (status === 401) navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
        else setState({ kind: 'error', key: status === 403 ? 'consent.adminOnly' : status === 404 ? 'consent.expired' : 'consent.loadError' });
      });
  }, [requestId, startError, navigate, location.pathname, location.search]);

  const decide = async (approve: boolean) => {
    if (state.kind !== 'ready') return;
    setBusy(true);
    try {
      const target = await OAuthAPI.decide(state.req.id, approve, state.req.csrf);
      setState({ kind: 'leaving' });
      window.location.assign(target);
    } catch (err) {
      setBusy(false);
      setState({ kind: 'error', key: err instanceof OAuthHttpError && err.status === 404 ? 'consent.expired' : 'consent.decideError' });
    }
  };

  return (
    <div className="wrap auth">
      <div className="panel">
        <div className="panel-bar"><span><span className="dot" />oauth@stealthdebug</span><span>consent</span></div>
        <div className="consent">
          <div className="eyebrow"><span className="p">$</span> <span className="c">authorize</span></div>
          <h1>{t('consent.title')}</h1>

          {state.kind === 'loading' && <p className="muted">{t('account.loading')}…</p>}
          {state.kind === 'leaving' && <p className="muted">{t('consent.leaving')}</p>}
          {state.kind === 'error' && <div className="alert error" role="alert">{t(state.key)}</div>}

          {state.kind === 'ready' && (
            <>
              <p>{t('consent.lead', { agent: state.req.agent })}</p>
              <dl className="consent-facts">
                <dt>{t('consent.agent')}</dt><dd>{state.req.agent}</dd>
                <dt>{t('consent.client')}</dt><dd>{state.req.client} <code>{state.req.clientId}</code></dd>
                <dt>{t('consent.redirect')}</dt><dd><code>{state.req.redirectUri}</code></dd>
                <dt>{t('consent.scopes')}</dt>
                <dd>
                  <ul>
                    {state.req.scopes.map((s) => (
                      <li key={s}><code>{s}</code>: {SCOPE_KEYS[s] ? t(SCOPE_KEYS[s]) : s}</li>
                    ))}
                  </ul>
                </dd>
              </dl>
              <p className="muted">{t('consent.never')}</p>
              <div className="consent-actions">
                <button type="button" className="btn primary" disabled={busy} onClick={() => decide(true)}>{t('consent.approve')}</button>
                <button type="button" className="btn" disabled={busy} onClick={() => decide(false)}>{t('consent.deny')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Consent;
