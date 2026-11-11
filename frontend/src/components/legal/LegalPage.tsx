import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import MarkdownRenderer from '../blog/MarkdownRenderer';
import { useI18n, type Lang } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import privacyEn from '../../content/legal/en/privacy.md?raw';
import privacyEs from '../../content/legal/es/privacy.md?raw';
import termsEn from '../../content/legal/en/terms.md?raw';
import termsEs from '../../content/legal/es/terms.md?raw';
import legalEn from '../../content/legal/en/legal.md?raw';
import legalEs from '../../content/legal/es/legal.md?raw';
import securityEn from '../../content/legal/en/security.md?raw';
import securityEs from '../../content/legal/es/security.md?raw';

export type LegalDoc = 'privacy' | 'terms' | 'legal' | 'security';

// When a document changes: edit both languages and update its date here.
// For the terms, also bump TERMS_VERSION in backend/src/controllers/auth.controller.ts.
const DOCS: Record<LegalDoc, { path: string; label: MessageKey; updated: string; text: Record<Lang, string> }> = {
  privacy:  { path: '/privacy',  label: 'legal.privacy',  updated: '2026-11-11', text: { en: privacyEn,  es: privacyEs } },
  terms:    { path: '/terms',    label: 'legal.terms',    updated: '2026-11-11', text: { en: termsEn,    es: termsEs } },
  legal:    { path: '/legal',    label: 'legal.legal',    updated: '2026-11-11', text: { en: legalEn,    es: legalEs } },
  security: { path: '/security', label: 'legal.security', updated: '2026-11-11', text: { en: securityEn, es: securityEs } },
};

// The first line of each file is its "# Title"; the page header shows it instead.
function split(md: string): { title: string; body: string } {
  const m = /^#\s+(.+)\n+/.exec(md);
  return m ? { title: m[1].trim(), body: md.slice(m[0].length) } : { title: '', body: md };
}

function LegalPage({ doc, lang: forced }: { doc: LegalDoc; lang?: Lang }) {
  const { lang, setLang, t } = useI18n();
  const { hash } = useLocation();

  // Spanish addresses (/privacidad, ...) open the Spanish version
  useEffect(() => { if (forced && forced !== lang) setLang(forced); }, [forced]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = DOCS[doc];
  const { title, body } = split(d.text[forced ?? lang]);

  useEffect(() => {
    document.title = `${title} · stealthdebug`;
    return () => { document.title = 'stealthdebug'; };
  }, [title]);

  // Jump to #section (e.g. /privacy#cookies-...) when rendered, and when a
  // link on the same page (the footer's "cookies") changes only the #section
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [doc, lang, hash]);

  return (
    <div className="wrap legal">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="p">$</span> <span className="c">cat {d.path.slice(1)}.md</span></div>
          <h1>{title}</h1>
          <p className="muted">{t('legal.updated', { date: d.updated })}</p>
        </div>
      </div>
      <div className="legal-grid">
        <article><MarkdownRenderer content={body} /></article>
        <aside>
          <nav className="toc" aria-label={t('legal.otherDocs')}>
            <span className="label">{t('legal.otherDocs')}</span>
            <ol>
              {(Object.keys(DOCS) as LegalDoc[]).map((k) => (
                <li key={k} className={k === doc ? 'active' : ''}>
                  <Link to={DOCS[k].path}>{t(DOCS[k].label)}</Link>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
    </div>
  );
}

export default LegalPage;
