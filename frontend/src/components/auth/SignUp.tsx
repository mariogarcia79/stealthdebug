import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthAPI from '../../api/auth.api';
import { validateSignup, MIN_PASSWORD_LENGTH } from '../../utils/validation';
import { useAuth } from '../../context/AuthContext';

function SignUp() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    const clientError = validateSignup(name, email, password);
    if (clientError) { setError(clientError); return; }
    try {
      setLoading(true);
      setError('');
      if (isAdmin) await AuthAPI.signUpAdmin(name.trim(), email.trim(), password, role);
      else await AuthAPI.signUp(name.trim(), email.trim(), password);
      navigate(isAdmin ? '/users' : '/login');
    } catch (err: any) {
      setError(String(err?.response?.data?.message || err?.message || 'Sign up failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap auth">
      <div className="panel">
        <div className="panel-bar"><span><span className="dot" />auth@stealthdebug</span><span>tty1</span></div>
        <form onSubmit={handleSignup} noValidate>
          <div className="eyebrow"><span className="p">$</span> <span className="c">{isAdmin ? 'useradd --admin' : 'useradd'}</span></div>
          <h1>{isAdmin ? 'Create admin' : 'Sign up'}</h1>
          <p>{isAdmin ? 'Create another administrator account.' : 'Create an account to comment on posts.'}</p>
          <div className="field">
            <label htmlFor="name">name</label>
            <input id="name" className="input" autoComplete="username" value={name}
              onChange={(e) => setName(e.target.value)} disabled={loading} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="email">email</label>
            <input id="email" className="input" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={loading} />
          </div>
          <div className="field">
            <label htmlFor="password">password</label>
            <input id="password" className="input" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} disabled={loading} />
            <span className="hint">At least {MIN_PASSWORD_LENGTH} characters, with an uppercase letter, a digit and a symbol.</span>
          </div>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button type="submit" className="btn primary block" disabled={loading}>
            {loading ? 'creating…' : isAdmin ? 'create admin' : 'sign up'}
          </button>
          {!isAdmin && <div className="alt">already have an account? <Link to="/login">log in</Link></div>}
        </form>
      </div>
    </div>
  );
}

export default SignUp;
