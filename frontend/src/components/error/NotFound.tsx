import { Link, useLocation } from 'react-router-dom';

function NotFound() {
  const { pathname } = useLocation();
  const path = pathname.length > 40 ? pathname.slice(0, 39) + '…' : pathname;

  return (
    <div className="wrap nf">
      <div>
        <div className="code" aria-hidden="true">404</div>
        <h1>Nothing at this address.</h1>
        <p>The page you were looking for doesn't exist, moved, or never did. Fuzzing the URL won't help either.</p>
        <div className="ctas">
          <Link to="/" className="btn primary">~/home</Link>
          <Link to="/blog" className="btn">browse the blog</Link>
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
