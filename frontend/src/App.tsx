import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import NotFound from './components/error/NotFound';
import MilkshakeRoulette from './components/misc/MilkshakeRoulette';

function App() {
  return (
    <Router>
      <header>
        <Navbar />
      </header>

      <main className="page-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<LogIn />} />
          <Route path="/blog" element={<BlogList />} />

          <Route
            path="/blog/new"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={<p className="sidebar-empty">Loading editor…</p>}>
                  <BlogEditor />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="/blog/edit/:id"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={<p className="sidebar-empty">Loading editor…</p>}>
                  <BlogEditor />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route path="/blog/:id" element={<BlogPost />} />

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

          <Route
            path="masai"
            element={
              <ProtectedRoute>
                <MilkshakeRoulette />
              </ProtectedRoute>
            }
          />

          {/* Fallback route for 404 Not Found */}
          <Route path="*" element={<NotFound />} />
        </Routes>

        <Footer />
      </main>
    </Router>
  );
}

export default App;
