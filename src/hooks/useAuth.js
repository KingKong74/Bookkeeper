/**
 * hooks/useAuth.js
 * ----------------
 * Authentication state and actions.
 * Thin wrapper around AppContext + authService.
 */

import { useApp } from '../context/AppContext';
import { signOut as _signOut } from '../services/authService';

export function useAuth() {
  const { session, user, authLoading } = useApp();

  async function signOut() {
    await _signOut();
  }

  return {
    session,
    user,
    authLoading,
    isAuthenticated: !!session,
    signOut,
  };
}
