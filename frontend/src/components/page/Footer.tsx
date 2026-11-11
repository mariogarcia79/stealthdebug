import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

function Footer() {
  const { t, lang } = useI18n();
  // heading id of the cookies section in each language's privacy policy
  const cookies = lang === 'es' ? '/privacy#cookies-y-almacenamiento-local' : '/privacy#cookies-and-local-storage';
  return (
    <footer className="footer">
      <div className="wrap">
        <span className="status">● online</span>
        <span className="sep">|</span>
        <span>stealthdebug.org</span>
        <span className="sep">|</span>
        <span>reverse · crack · disasm</span>
        <span className="right">
          <a href="https://github.com/mariogarcia79/stealthdebug" target="_blank" rel="noopener noreferrer">{t('footer.source')}</a>
          <span>© {new Date().getFullYear()} Mario García Carbonero</span>
        </span>
        <nav className="legal-links" aria-label={t('legal.otherDocs')}>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to={cookies}>{t('footer.cookies')}</Link>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/legal">{t('footer.legal')}</Link>
          <Link to="/security">{t('footer.security')}</Link>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
