import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PostSummary } from '../../types/post';
import PostAPI from '../../api/posts.api';
import { useAuth } from '../../context/AuthContext';
import PostRow from './PostRow';

function BlogList() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const { isLoggedIn, role } = useAuth();

  const q = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';

  useEffect(() => {
    PostAPI.getAllPosts()
      .then(setPosts)
      .catch(() => { setPosts([]); setError('Error loading posts.'); });
  }, []);

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
          <h1>Blog</h1>
          <p>Write-ups on hardware hacking, firmware analysis and embedded Linux.</p>
        </div>
        <div className="tools">
          <label className="visually-hidden" htmlFor="filter">Filter posts</label>
          <input
            id="filter"
            className="input"
            type="search"
            placeholder="filter posts…"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
          />
          {tag && <button type="button" className="btn" onClick={() => setParam('tag', '')}>#{tag} ×</button>}
          {isLoggedIn && role === 'admin' && <Link to="/blog/new" className="btn primary">new post</Link>}
        </div>
      </div>

      {posts === null ? (
        <p className="empty loading">loading posts</p>
      ) : error ? (
        <p className="alert error">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="empty">
          {posts.length === 0 ? 'No posts yet.' : 'No posts match this filter.'}
        </p>
      ) : (
        byYear.map(([year, items]) => (
          <section key={year} className="year-group">
            <div className="section-head">
              <h2>{year}</h2><span className="rule" />
              <span className="count">{items.length} {items.length === 1 ? 'post' : 'posts'}</span>
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
