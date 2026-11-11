import { Link } from 'react-router-dom';
import type { PostSummary } from '../../types/post';
import { isoDate } from '../../utils/format';

interface Props {
  post: PostSummary;
  index: number;            // shown as 0x.. (1 = oldest)
  onTag?: (tag: string) => void;
}

function Cover({ post }: { post: PostSummary }) {
  const c = post.cover;
  if (!c) return null;
  const srcSet = c.variants?.length
    ? [...c.variants.map((v) => `${v.url} ${v.width}w`), ...(c.width ? [`${c.url} ${c.width}w`] : [])].join(', ')
    : undefined;
  return (
    <Link to={`/blog/${post._id}`} className="thumb" tabIndex={-1} aria-hidden="true">
      <img
        src={c.variants?.[0]?.url ?? c.url}
        srcSet={srcSet}
        sizes="(max-width: 900px) 100vw, 220px"
        width={c.width}
        height={c.height}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </Link>
  );
}

function PostRow({ post, index, onTag }: Props) {
  return (
    <article className={`post-row ${post.cover ? '' : 'no-cover'}`}>
      <div className="meta">
        <span className="idx">0x{index.toString(16).padStart(2, '0')}</span>
        <time dateTime={post.createdAt}>{isoDate(post.createdAt)}</time>
        <span>{post.readingMinutes} min read</span>
      </div>
      <div>
        <h3><Link to={`/blog/${post._id}`}>{post.title}</Link></h3>
        <p>{post.summary}</p>
        {(post.tags?.length > 0 || post.series) && (
          <div className="tags">
            {post.series && <span className="tag accent">{post.series}</span>}
            {post.tags.map((t) =>
              onTag ? (
                <button key={t} type="button" className="tag" onClick={() => onTag(t)}>#{t}</button>
              ) : (
                <Link key={t} to={`/blog?tag=${encodeURIComponent(t)}`} className="tag">#{t}</Link>
              )
            )}
          </div>
        )}
      </div>
      <Cover post={post} />
    </article>
  );
}

export default PostRow;
