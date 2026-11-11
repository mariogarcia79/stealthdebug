import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n';

function NotFound() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const path = pathname.length > 40 ? pathname.slice(0, 39) + '…' : pathname;

  return (
    <div className="wrap nf">
      <div>
        <div className="code" aria-hidden="true">404</div>
        <h1>{t('nf.title')}</h1>
        <p>{t('nf.text')}</p>
        <div className="ctas">
          <Link to="/" className="btn primary">~/home</Link>
          <Link to="/blog" className="btn">{t('nf.browse')}</Link>
        </div>
      </div>
      <div className="panel" aria-hidden="true">
        <div className="panel-bar"><span><span className="dot red" />bash</span><span>exit 1</span></div>
        <pre>
          <span className="ps">$</span> cd {path}{'\n'}
          <span className="er">bash: cd: {path}: No such file or directory</span>{'\n'}
          <span className="ps">$</span> ls ~/{'\n'}
          blog/  home{'\n'}
          <span className="ps">$</span> <span className="cur" />
        </pre>
      </div>
    </div>
  );
}

export default NotFound;
