/**
 * hooks/useTheme.js
 * -----------------
 * Manages dark/light mode preference.
 * Reads from localStorage, writes to both localStorage and the DOM.
 * Components never touch document.documentElement directly.
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'pref_dark_mode';

function readDark() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function applyDark(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem(STORAGE_KEY, dark ? 'true' : 'false');
}

export function useTheme() {
  const [dark, setDark] = useState(readDark);

  // Apply on mount
  useEffect(() => { applyDark(dark); }, []); // eslint-disable-line

  function toggle() {
    const next = !dark;
    setDark(next);
    applyDark(next);
  }

  function setTheme(isDark) {
    setDark(isDark);
    applyDark(isDark);
  }

  return { dark, toggle, setTheme };
}
