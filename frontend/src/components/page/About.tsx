import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PagesAPI, { type Page } from '../../api/pages.api';
import MarkdownRenderer from '../blog/MarkdownRenderer';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { isoDate } from '../../utils/format';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

// The first image on a line of its own (e.g. the headshot) is shown as a
// portrait in the right column, where posts have their table of contents;
// the rest of the markdown is the page.
const PORTRAIT = /^[ \t]*!\[[^\]\n]*\]\([^)\n]+\)[ \t]*$/m;
function splitPortrait(content: string): { portrait: string | null; body: string } {
  const m = PORTRAIT.exec(content);
  if (!m) return { portrait: null, body: content };
  return { portrait: m[0].trim(), body: content.slice(0, m.index) + content.slice(m.index + m[0].length) };
}

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

  useDocumentTitle(t('about.title'));

  const empty = !page?.content.trim();
  const { portrait, body } = splitPortrait(page?.content ?? '');

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
      <div className={portrait ? 'post-grid about-grid' : undefined}>
        <article className="about-body">
          {page === undefined ? (
            <p className="empty loading">{t('account.loading')}</p>
          ) : page === null ? (
            <p className="alert error">{t('about.loadError')}</p>
          ) : empty ? (
            <p className="empty">{t('about.empty')}</p>
          ) : (
            <MarkdownRenderer content={body} images={page.images} />
          )}
        </article>
        {portrait && page && (
          <aside className="about-portrait">
            <MarkdownRenderer content={portrait} images={page.images} />
          </aside>
        )}
      </div>
    </div>
  );
}

export default About;
