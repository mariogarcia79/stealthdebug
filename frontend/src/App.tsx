import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from "./components/page/Navbar";
import Home from "./components/page/Home";
import SignUp from './components/auth/SignUp';
import LogIn from './components/auth/LogIn';
import BlogList from './components/blog/BlogList';
import BlogPost from './components/blog/BlogPost';
// The editor (CodeMirror) is only for the admin: load it on demand so it isn't
// part of the bundle every reader downloads.
const BlogEditor = lazy(() => import('./components/blog/BlogEditor'));
import UserDashboard from './components/user/UserDashboard';
import UserList from './components/user/UserList';
import { ProtectedRoute } from './components/page/ProtectedRoute';
import Footer from './components/page/Footer';
import About from './components/page/About';
import NotFound from './components/error/NotFound';
// Legal documents (8 markdown files): loaded only when one is opened
const LegalPageLazy = lazy(() => import('./components/legal/LegalPage'));
type LegalProps = { doc: 'privacy' | 'terms' | 'legal' | 'security'; lang?: 'en' | 'es' };
const LegalPage = (props: LegalProps) => (
  <Suspense fallback={<div className="wrap"><p className="empty loading" style={{ paddingTop: 64 }}>…</p></div>}>
    <LegalPageLazy {...props} />
  </Suspense>
);

// New page = start at the top (unless jumping to a #section)
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname, hash]);
  return null;
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <Navbar />

      <main className="site-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<LogIn />} />
          <Route path="/blog" element={<BlogList />} />

          <Route
            path="/blog/new"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={<div className="wrap"><p className="empty loading">loading editor</p></div>}>
                  <BlogEditor />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="/blog/edit/:id"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={<div className="wrap"><p className="empty loading">loading editor</p></div>}>
                  <BlogEditor />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route path="/blog/:id" element={<BlogPost />} />

          <Route path="/about" element={<About />} />
          <Route
            path="/about/edit"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={<div className="wrap"><p className="empty loading">loading editor</p></div>}>
                  <BlogEditor page="about" />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="/users"
            element={
              <ProtectedRoute requiredRole="admin">
                <UserList />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <UserDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/:userId"
            element={
              <ProtectedRoute requiredRole="admin">
                <UserDashboard />
              </ProtectedRoute>
            }
          />

          {/* Legal documents (both languages; the Spanish addresses open the Spanish version) */}
          <Route path="/privacy" element={<LegalPage doc="privacy" />} />
          <Route path="/terms" element={<LegalPage doc="terms" />} />
          <Route path="/legal" element={<LegalPage doc="legal" />} />
          <Route path="/security" element={<LegalPage doc="security" />} />
          <Route path="/privacidad" element={<LegalPage doc="privacy" lang="es" />} />
          <Route path="/condiciones" element={<LegalPage doc="terms" lang="es" />} />
          <Route path="/aviso-legal" element={<LegalPage doc="legal" lang="es" />} />
          <Route path="/seguridad" element={<LegalPage doc="security" lang="es" />} />

          {/* Fallback route for 404 Not Found */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
    </Router>
  );
}

export default App;
