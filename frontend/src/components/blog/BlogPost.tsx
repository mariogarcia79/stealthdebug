import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { PostDetail } from '../../types/post';
import PostAPI from '../../api/posts.api';
import MarkdownRenderer from './MarkdownRenderer';
import BlogCommentList from './BlogCommentList';
import NotFound from '../error/NotFound';
import { isoDate } from '../../utils/format';

interface Heading { id: string; text: string; level: number }

// Contents sidebar: built from the rendered headings, highlights the section
// being read and shows reading progress.
function Toc({ article }: { article: React.RefObject<HTMLElement | null> }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState('');
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = article.current;
    if (!el) return;
    const list = [...el.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')];
    setHeadings(list.map((h) => ({ id: h.id, text: h.textContent ?? '', level: h.tagName === 'H3' ? 3 : 2 })));

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      setProgress(Math.min(100, Math.max(0, total > 0 ? (-rect.top / total) * 100 : 100)));
      let current = list[0]?.id ?? '';
      for (const h of list) if (h.getBoundingClientRect().top < 140) current = h.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [article]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('#')[0]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="toc">
      {headings.length > 0 && (
        <>
          <span className="label">contents</span>
          <ol>
            {headings.map((h) => (
              <li key={h.id} className={`${h.level === 3 ? 'sub' : ''} ${h.id === active ? 'active' : ''}`}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="progress">
        {Math.round(progress)}% read
        <div className="bar"><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="actions">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ back to top</button>
        <button type="button" onClick={copyLink}>{copied ? '✓ link copied' : '⧉ copy link'}</button>
      </div>
    </div>
  );
}

function BlogPost() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostDetail | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const { isLoggedIn, role } = useAuth();
  const article = useRef<HTMLDivElement>(null);
  const isAdmin = isLoggedIn && role === 'admin';

  useEffect(() => {
    if (!id) return;
    setPost(undefined);
    PostAPI.getPostById(id).then(setPost).catch(() => setPost(null));
  }, [id]);

  useEffect(() => {
    if (post) document.title = `${post.title} · stealthdebug`;
    return () => { document.title = 'stealthdebug'; };
  }, [post]);

  // Jump to #section once the content is rendered
  useEffect(() => {
    if (!post || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [post]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await PostAPI.deletePost(id);
      navigate('/blog');
    } catch {
      setError('Failed to delete post.');
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (post === undefined) {
    return <div className="wrap"><p className="empty loading" style={{ paddingTop: 64 }}>loading post</p></div>;
  }
  if (post === null || (!post.published && !isAdmin)) return <NotFound />;

  const imageCount = Object.keys(post.images ?? {}).length;

  return (
    <div className="wrap">
      <header className="post-head">
        <div className="crumbs">
          <Link to="/blog">~/blog</Link>
          {post.series && <><span>/</span><span>{post.series.name.toLowerCase()}</span></>}
          {isAdmin && (
            <span className="admin-actions">
              {confirming ? (
                <>
                  <span className="muted">delete this post?</span>
                  <button className="btn sm danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'deleting…' : 'yes, delete'}</button>
                  <button className="btn sm ghost" onClick={() => setConfirming(false)}>cancel</button>
                </>
              ) : (
                <>
                  <Link to={`/blog/edit/${post._id}`} className="btn sm">edit</Link>
                  <button className="btn sm danger" onClick={() => setConfirming(true)}>delete</button>
                </>
              )}
            </span>
          )}
        </div>
        <h1>{post.title}</h1>
        <p className="lead">{post.summary}</p>
        <div className="post-meta">
          <time dateTime={post.createdAt}>{isoDate(post.createdAt)}</time>
          <span>{post.readingMinutes} min read</span>
          {post.series && <span className="series">series: {post.series.name} · part {post.series.part}/{post.series.total}</span>}
          {imageCount > 0 && <span>{imageCount} {imageCount === 1 ? 'image' : 'images'}</span>}
          {!post.published && <span className="tag" style={{ color: 'var(--danger-fg)' }}>unpublished</span>}
          {post.tags.length > 0 && (
            <span className="tags">
              {post.tags.map((t) => <Link key={t} className="tag" to={`/blog?tag=${encodeURIComponent(t)}`}>#{t}</Link>)}
            </span>
          )}
        </div>
        {error && <p className="alert error" style={{ marginTop: 18 }}>{error}</p>}
      </header>

      <div className="post-grid">
        <article ref={article}>
          {post.series && post.series.total > 1 && (
            <nav className="panel series-box" aria-label="Series">
              <span className="label">series · <b>{post.series.name}</b></span>
              <ol>
                {post.series.posts.map((p) => (
                  <li key={p._id} className={p._id === post._id ? 'current' : ''}>
                    {p._id === post._id ? p.title : <Link to={`/blog/${p._id}`}>{p.title}</Link>}
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <MarkdownRenderer content={post.content} images={post.images} />

          <footer className="post-end">
            {(post.prev || post.next) && (
              <nav className="nextprev" aria-label="More posts">
                {post.prev && (
                  <Link to={`/blog/${post.prev._id}`} className="panel">
                    <small>← older</small><b>{post.prev.title}</b>
                  </Link>
                )}
                {post.next && (
                  <Link to={`/blog/${post.next._id}`} className="panel r">
                    <small>newer →</small><b>{post.next.title}</b>
                  </Link>
                )}
              </nav>
            )}
            <BlogCommentList postId={post._id} />
          </footer>
        </article>
        <aside><Toc key={post._id} article={article} /></aside>
      </div>
    </div>
  );
}

export default BlogPost;
