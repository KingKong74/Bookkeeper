/**
 * hooks/useSessionPref.js
 * -----------------------
 * Stores lightweight user preferences that persist for 24 hours.
 * Used for "don't show again" prompts etc.
 * Backed by localStorage with a TTL — cleared after 24h automatically.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getSessionPref(key) {
  try {
    const raw = localStorage.getItem(`pref_${key}`);
    if (!raw) return null;
    const { value, expires } = JSON.parse(raw);
    if (Date.now() > expires) { localStorage.removeItem(`pref_${key}`); return null; }
    return value;
  } catch { return null; }
}

export function setSessionPref(key, value, ttlMs = TTL_MS) {
  try {
    localStorage.setItem(`pref_${key}`, JSON.stringify({
      value,
      expires: Date.now() + ttlMs,
    }));
  } catch {}
}

export function clearSessionPref(key) {
  localStorage.removeItem(`pref_${key}`);
}
