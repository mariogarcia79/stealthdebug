import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthAPI from '../../api/auth.api';
import { validateLogin } from '../../utils/validation';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const clientError = validateLogin(name, password);
    if (clientError) { setError(clientError); return; }
    try {
      setLoading(true);
      setError('');
      await AuthAPI.logIn(name.trim(), password);
      await login();
      navigate('/blog');
    } catch (err: any) {
      setError(String(err?.response?.data?.message || err?.message || 'Login failed. Check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap auth">
      <div className="panel">
        <div className="panel-bar"><span><span className="dot" />auth@stealthdebug</span><span>tty1</span></div>
        <form onSubmit={handleLogin} noValidate>
          <div className="eyebrow"><span className="p">$</span> <span className="c">login</span></div>
          <h1>Log in</h1>
          <p>Log in to comment on posts.</p>
          <div className="field">
            <label htmlFor="name">name</label>
            <input id="name" className="input" autoComplete="username" value={name}
              onChange={(e) => setName(e.target.value)} disabled={loading} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">password</label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} disabled={loading} />
          </div>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button type="submit" className="btn primary block" disabled={loading}>{loading ? 'logging in…' : 'log in'}</button>
          <div className="alt">no account? <Link to="/signup">sign up</Link></div>
        </form>
      </div>
    </div>
  );
}

export default Login;
