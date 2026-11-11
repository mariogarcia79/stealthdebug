import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PostSummary } from '../../types/post';
import PostAPI from '../../api/posts.api';
import { useAuth } from '../../context/AuthContext';
import PostRow from './PostRow';
import { useI18n } from '../../i18n';

function BlogList() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const { isLoggedIn, role } = useAuth();
  const { t } = useI18n();

  const q = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';

  // The admin also sees unpublished posts (marked "draft")
  const isAdmin = isLoggedIn && role === 'admin';
  useEffect(() => {
    PostAPI.getAllPosts(isAdmin)
      .then(setPosts)
      .catch(() => { setPosts([]); setError('blog.loadError'); });
  }, [isAdmin]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  // index: 0x01 = oldest post, stable regardless of filters
  const indexed = useMemo(() => (posts ?? []).map((p, i, all) => ({ p, index: all.length - i })), [posts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return indexed.filter(({ p }) =>
      (!tag || p.tags.includes(tag)) &&
      (!term || [p.title, p.summary, p.series, ...p.tags].join(' ').toLowerCase().includes(term))
    );
  }, [indexed, q, tag]);

  const byYear = useMemo(() => {
    const groups = new Map<number, typeof filtered>();
    for (const item of filtered) {
      const y = new Date(item.p.createdAt).getFullYear();
      groups.set(y, [...(groups.get(y) ?? []), item]);
    }
    return [...groups.entries()];
  }, [filtered]);

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow"><span className="p">$</span> <span className="c">ls -lt ~/blog</span></div>
          <h1>{t('blog.title')}</h1>
          <p>{t('blog.lead')}{t('blog.langNote') && <> <span className="muted">{t('blog.langNote')}</span></>}</p>
        </div>
        <div className="tools">
          <label className="visually-hidden" htmlFor="filter">{t('blog.filter')}</label>
          <input
            id="filter"
            className="input"
            type="search"
            placeholder={t('blog.filterPlaceholder')}
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
          />
          {tag && <button type="button" className="btn" onClick={() => setParam('tag', '')}>#{tag} ×</button>}
          {isLoggedIn && role === 'admin' && <Link to="/blog/new" className="btn primary">{t('nav.newPost')}</Link>}
        </div>
      </div>

      {posts === null ? (
        <p className="empty loading">{t('blog.loading')}</p>
      ) : error ? (
        <p className="alert error">{t('blog.loadError')}</p>
      ) : filtered.length === 0 ? (
        <p className="empty">
          {posts.length === 0 ? t('blog.none') : t('blog.noMatch')}
        </p>
      ) : (
        byYear.map(([year, items]) => (
          <section key={year} className="year-group">
            <div className="section-head">
              <h2>{year}</h2><span className="rule" />
              <span className="count">{items.length} {items.length === 1 ? t('blog.post') : t('blog.posts')}</span>
            </div>
            <div className="posts">
              {items.map(({ p, index }) => (
                <PostRow key={p._id} post={p} index={index} onTag={(t) => setParam('tag', t)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export default BlogList;
