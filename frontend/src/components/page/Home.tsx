import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PostAPI from '../../api/posts.api';
import type { PostSummary } from '../../types/post';
import { useAuth } from '../../context/AuthContext';
import PostRow from '../blog/PostRow';
import { useI18n } from '../../i18n';

// Decorative: the first bytes of a MIPS kernel uImage (magic 27 05 19 56)
// and a SquashFS root filesystem, as found in router firmware dumps.
const HEXDUMP: { o: string; h: string; a: string; hi?: boolean }[] = [
  { o: '00000000', h: '2705 1956 8a1c 4f02 51e2 a9c0 000f 2a40', a: "'..V..O.Q.....*@", hi: true },
  { o: '00000010', h: '8000 0000 8000 6c10 3d6b 19e7 0505 0203', a: '......l.=k......' },
  { o: '00000020', h: '4c69 6e75 7820 4b65 726e 656c 2049 6d61', a: 'Linux Kernel Ima' },
  { o: '00000030', h: '6765 0000 0000 0000 0000 0000 0000 0000', a: 'ge..............' },
  { o: '00000040', h: '6d00 0080 0000 1000 5d00 0080 0000 4f03', a: 'm.......].....O.' },
  { o: '00000050', h: '9fb0 9e3c 2a1f 0e44 b2a1 77c0 31d8 e64a', a: '...<*..D..w.1..J' },
  { o: '00000060', h: 'c21f 6a38 05be 41f9 8d6e 2c03 99a7 5b10', a: '..j8..A..n,...[.' },
  { o: '00000070', h: '7e4d e0a2 13c9 8b54 0f62 d417 a8e3 6c25', a: '~M.....T.b....l%' },
];

function Hexdump() {
  return (
    <div className="panel hexdump" aria-hidden="true">
      <div className="panel-bar"><span><span className="dot" />root@lab: ~/zte-h108n</span><span>bash</span></div>
      <pre>
        <span className="k">$</span> <span className="a">xxd dump_mtd1_KERNEL.bin | head</span>{'\n'}
        {HEXDUMP.map((l) => (
          <span key={l.o}>
            <span className="o">{l.o}:</span>{' '}
            {l.hi ? <><span className="h">{l.h.slice(0, 9)}</span>{l.h.slice(9)}</> : l.h}
            {'  '}<span className="a">{l.a}</span>{'\n'}
          </span>
        ))}
        <span className="o">…</span>{'\n'}
        <span className="k">$</span> <span className="a">binwalk dump_mtd2_ROOTFS.bin</span>{'\n'}
        <span className="o">0x0</span>{'       '}<span className="h">Squashfs filesystem</span>, little endian, v4.0, lzma
      </pre>
    </div>
  );
}

function Home() {
  const { isLoggedIn, role } = useAuth();
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    PostAPI.getAllPosts().then(setPosts).catch(() => setPosts([]));
  }, []);

  const latest = posts?.[0];
  const tags = [...new Set((posts ?? []).flatMap((p) => p.tags))].slice(0, 8);
  const topics = tags.length ? tags : ['reverse-engineering', 'firmware', 'uart', 'embedded-linux'];

  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <div className="eyebrow"><span className="p">$</span> <span className="c">whoami</span> — {t('home.whoami')}</div>
          <h1>{t('home.title1')}<em>{t('home.titleEm')}</em>{t('home.title2')}</h1>
          <p className="lead">
            {t('home.lead1')}<strong>{t('home.leadStrong')}</strong>{t('home.lead2')}
          </p>
          <div className="ctas">
            <Link to="/blog" className="btn primary">{t('home.readBlog')}</Link>
            {latest && <Link to={`/blog/${latest._id}`} className="btn" title={latest.title}>{t('home.latestPost')}</Link>}
          </div>
          <div className="topics">
            {topics.map((t) => (
              <Link key={t} to={tags.length ? `/blog?tag=${encodeURIComponent(t)}` : '/blog'} className="tag accent">#{t}</Link>
            ))}
          </div>
        </div>
        <Hexdump />
      </section>

      {isLoggedIn && role === 'admin' && (
        <div className="panel admin-strip">
          <span className="eyebrow"><span className="p">#</span> admin</span>
          <span className="grow" />
          <Link to="/blog/new" className="btn sm primary">new post</Link>
          <Link to="/users" className="btn sm">users</Link>
        </div>
      )}

      <div className="section-head">
        <h2>{t('home.latestPosts')}</h2><span className="rule" />
        <Link to="/blog" className="count">{posts ? t('home.allPosts', { n: posts.length }) : ''}</Link>
      </div>
      {posts === null ? (
        <p className="empty loading">{t('blog.loading')}</p>
      ) : posts.length === 0 ? (
        <p className="empty">{t('blog.none')}</p>
      ) : (
        <div className="posts">
          {posts.slice(0, 3).map((p, i) => <PostRow key={p._id} post={p} index={posts.length - i} />)}
        </div>
      )}
    </div>
  );
}

export default Home;
