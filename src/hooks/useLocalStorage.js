/**
 * hooks/useLocalStorage.js
 * ------------------------
 * A custom React hook that works exactly like useState, but also
 * persists the value to localStorage automatically.
 *
 * Usage:
 *   const [txns, setTxns] = useLocalStorage('ledger_txns', []);
 *
 * On mount:     reads from localStorage (falls back to initialValue if empty)
 * On each set:  writes the new value to localStorage as JSON
 */

import { useState, useEffect } from 'react';

export function useLocalStorage(key, initialValue) {
  // ── Initialise state from localStorage (or seed value) ──────────────────
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      // If something is already saved, use it; otherwise use the seed data
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`useLocalStorage: could not read key "${key}"`, error);
      return initialValue;
    }
  });

  // ── Persist to localStorage whenever the value changes ──────────────────
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(`useLocalStorage: could not write key "${key}"`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
