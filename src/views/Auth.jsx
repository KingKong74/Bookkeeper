/**
 * views/Auth.jsx
 * Moniqr branded sign-in / sign-up screen.
 * Logo click toggles dark/light mode — preference persists to the main app.
 */

import React, { useState, useEffect, useRef } from 'react';
import { signIn, signUp } from '../services/authService';

function getTheme() {
  return localStorage.getItem('pref_dark_mode') === 'true' ? 'dark' : 'light';
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('pref_dark_mode', dark ? 'true' : 'false');
}

export function AuthScreen() {
  const [mode,     setMode]     = useState('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [dark,      setDark]     = useState(() => getTheme() === 'dark');
  const [flipPhase, setFlipPhase] = useState(null); // null | 'out' | 'in'
  const flipLocked = useRef(false);

  // Apply saved theme on mount
  useEffect(() => { applyTheme(dark); }, []);

  function toggleTheme() {
    if (flipLocked.current) return;
    flipLocked.current = true;
    const next = !dark;

    setFlipPhase('out');
    setTimeout(() => {
      applyTheme(next);
      setDark(next);
      setFlipPhase('in');
      // Sync favicon at same midpoint as icon swap
      const favicon = document.querySelector("link[rel~='icon']");
      if (favicon) favicon.href = next ? '/icon-dark.png' : '/icon-light.png';
    }, 130);
    setTimeout(() => {
      setFlipPhase(null);
      flipLocked.current = false;
    }, 270);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, name);
        setSuccess('Account created! Check your email to confirm, then sign in.');
        setMode('signin');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--sand)', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Brand — click logo to toggle dark/light */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <button
            onClick={toggleTheme}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={flipPhase === 'out' ? 'sb-logo-btn--flip-out' : flipPhase === 'in' ? 'sb-logo-btn--flip-in' : ''}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, display: 'inline-block', marginBottom: 16,
              borderRadius: 22, perspective: '400px',
              transition: flipPhase ? 'none' : 'transform 0.15s ease',
            }}
            onMouseEnter={e => { if (!flipPhase) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <img
              src={dark ? '/icon-dark.png' : '/icon-light.png'}
              alt="Moniqr logo"
              style={{ width: 88, height: 88, borderRadius: 20, display: 'block' }}
            />
          </button>

          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Moniq<span style={{ color: dark ? '#7C3AED' : '#D97706' }}>r</span>
          </h1>
          <p style={{ fontSize: 12, color: 'var(--stone)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 2px' }}>
            Smart bookkeeping.
          </p>
          <p style={{ fontSize: 12, color: dark ? '#06B6D4' : '#D97706', letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0, fontWeight: 500 }}>
            Clear insights.
          </p>

          <p style={{ fontSize: 11, color: 'var(--stone2)', marginTop: 10 }}>
            {dark ? '☀️' : '🌙'} Click logo to switch to {dark ? 'light' : 'dark'} mode
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '0.5px solid var(--bd)' }}>
            {['signin', 'signup'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                style={{
                  flex: 1, padding: '12px 0', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
                  color: mode === m ? 'var(--ink)' : 'var(--stone)',
                  fontWeight: mode === m ? 600 : 400,
                  borderBottom: mode === m ? `2px solid ${dark ? '#7C3AED' : '#D97706'}` : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s',
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <div style={{ padding: '20px 24px 24px' }}>
            <form onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="field">
                  <label>Your name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex" required />
                </div>
              )}
              <div className="field">
                <label>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 8 characters' : ''}
                  required minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              </div>

              {error && (
                <div style={{ padding: '8px 12px', background: 'var(--rdb)', color: 'var(--rd)', borderRadius: 'var(--rr)', fontSize: 12, marginBottom: 14 }}>
                  {error}
                </div>
              )}
              {success && (
                <div style={{ padding: '8px 12px', background: 'var(--gnb)', color: 'var(--gn)', borderRadius: 'var(--rr)', fontSize: 12, marginBottom: 14 }}>
                  {success}
                </div>
              )}

              <button type="submit" className="btn btn-a" disabled={loading}
                style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600 }}>
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--stone)', marginTop: 16 }}>
          Stored securely in Australia · ap-southeast-2
        </p>
      </div>
    </div>
  );
}
