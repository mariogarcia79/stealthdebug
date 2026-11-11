import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PagesAPI, { type Page } from '../../api/pages.api';
import MarkdownRenderer from '../blog/MarkdownRenderer';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { isoDate } from '../../utils/format';

// "About me" / CV page. Its content is markdown written in the admin editor
// (/about/edit); until something is saved it shows as empty.
function About() {
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const { isLoggedIn, role } = useAuth();
  const { t } = useI18n();
  const isAdmin = isLoggedIn && role === 'admin';

  useEffect(() => {
    PagesAPI.get('about').then(setPage).catch(() => setPage(null));
  }, []);

  useEffect(() => {
    document.title = `${t('about.title')} · stealthdebug`;
    return () => { document.title = 'stealthdebug'; };
  }, [t]);

  const empty = !page?.content.trim();

  return (
    <div className="wrap about">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="p">$</span> <span className="c">whoami</span></div>
          <h1>{t('about.title')}</h1>
          {page?.updatedAt && !empty && <p className="muted">{t('legal.updated', { date: isoDate(page.updatedAt) })}</p>}
        </div>
        {isAdmin && (
          <div className="tools">
            <Link to="/about/edit" className="btn sm">{t('post.edit')}</Link>
          </div>
        )}
      </div>
      <article className="about-body">
        {page === undefined ? (
          <p className="empty loading">{t('account.loading')}</p>
        ) : page === null ? (
          <p className="alert error">{t('about.loadError')}</p>
        ) : empty ? (
          <p className="empty">{t('about.empty')}</p>
        ) : (
          <MarkdownRenderer content={page.content} images={page.images} />
        )}
      </article>
    </div>
  );
}

export default About;
