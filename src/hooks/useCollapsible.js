/**
 * hooks/useCollapsible.js
 * -----------------------
 * Manages sidebar collapsed state with localStorage persistence.
 */

import { useState } from 'react';

export function useCollapsible(storageKey, defaultValue = false) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved !== null ? saved === 'true' : defaultValue;
  });

  function toggle() {
    setCollapsed(v => {
      const next = !v;
      localStorage.setItem(storageKey, next ? 'true' : 'false');
      return next;
    });
  }

  return { collapsed, toggle };
}
