/**
 * main.jsx
 * --------
 * Application entry point.
 * Wraps the app in AppProvider so all components can access shared state.
 */

import React from 'react';
// Apply dark mode before first render to avoid flash
if (localStorage.getItem('pref_dark_mode') === 'true') {
  document.documentElement.setAttribute('data-theme', 'dark');
}
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
