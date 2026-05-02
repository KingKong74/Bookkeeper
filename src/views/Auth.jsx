/**
 * views/Auth.jsx
 * --------------
 * Sign in / Sign up screen shown when the user has no active session.
 * Minimal — just email + password. No social login for now.
 *
 * After sign-up, Supabase sends a confirmation email. The user's org
 * and default data are seeded by the create_personal_org() DB function.
 */

import React, { useState } from 'react';
import { signIn, signUp } from '../lib/supabase';

export function AuthScreen() {
  const [mode,     setMode]     = useState('signin'); // 'signin' | 'signup'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password, name);
        setSuccess('Account created! Check your email to confirm your address, then sign in.');
        setMode('signin');
      } else {
        await signIn(email, password);
        // AppContext will pick up the new session via onAuthStateChange
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
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 32, height: 32, background: '#BA7517',
            transform: 'rotate(45deg)', borderRadius: 4,
            margin: '0 auto 14px', display: 'inline-block',
          }} />
          <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--ink)' }}>Ledger</h1>
          <p style={{ fontSize: 13, color: 'var(--stone)', marginTop: 4 }}>
            Personal finance, done properly.
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px 0' }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid var(--bd)', marginBottom: 20 }}>
              {['signin', 'signup'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                  style={{
                    flex: 1, padding: '8px 0', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
                    color: mode === m ? 'var(--ink)' : 'var(--stone)',
                    fontWeight: mode === m ? 500 : 400,
                    borderBottom: mode === m ? '2px solid #BA7517' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="field">
                  <label>Your name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Alex"
                    required
                  />
                </div>
              )}

              <div className="field">
                <label>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 8 characters' : ''}
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>

              {/* Error / success messages */}
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

              <button
                type="submit"
                className="btn btn-a"
                disabled={loading}
                style={{ width: '100%', padding: '9px 0', fontSize: 13, marginBottom: 16 }}
              >
                {loading
                  ? 'Please wait…'
                  : mode === 'signin' ? 'Sign in' : 'Create account'
                }
              </button>
            </form>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--stone)', marginTop: 16 }}>
          Your data is stored securely in Australia (ap-southeast-2).
        </p>
      </div>
    </div>
  );
}
