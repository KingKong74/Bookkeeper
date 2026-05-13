/**
 * main.jsx
 * --------
 * Application entry point.
 * Wraps the app in AppProvider so all components can access shared state.
 */

import React from 'react';

// ── Apply dark mode before first render (avoids flash) ────────────────────────
const isDark = localStorage.getItem('pref_dark_mode') === 'true';
if (isDark) document.documentElement.setAttribute('data-theme', 'dark');

// ── Set favicon to match current theme ───────────────────────────────────────
function setFavicon(dark) {
  const existing = document.querySelector("link[rel~='icon']");
  const link = existing || document.createElement('link');
  link.rel  = 'icon';
  link.type = 'image/png';
  link.href = dark ? '/icon-dark.png' : '/icon-light.png';
  if (!existing) document.head.appendChild(link);
}
setFavicon(isDark);

// Favicon is swapped directly in Sidebar.jsx and Auth.jsx at the flip midpoint (130ms)
// for perfect synchronisation. The MutationObserver approach lags by a frame.

// Set page title
document.title = 'Moniqr';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './context/AppContext';
import App from './App';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
