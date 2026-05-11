/**
 * components/layout/Sidebar.jsx
 * ------------------------------
 * Left navigation sidebar with collapsible icon-only mode.
 *
 * Collapsed state persists in localStorage so the user's preference
 * survives page refreshes. In collapsed mode only icons are visible
 * with tooltips on hover for accessibility.
 */

import React, { useState, useEffect } from 'react';
import { Badge } from '../ui/index';
import { fyLabel, dateRangeLabel } from '../../utils/helpers';
import { useApp } from '../../context/AppContext';

const NAV_GROUPS = [
  { label: null, items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  ]},
  { label: 'Banking', items: [
    { key: 'transactions', label: 'Transactions',     icon: 'list',   badge: 'ua', badge2: 'unlinked' },
    { key: 'accounts',     label: 'Bank accounts',    icon: 'bank' },
    { key: 'approve',      label: 'Auto-categorise',  icon: 'check',  badge: 'approve' },
    { key: 'import',       label: 'Import statement', icon: 'upload' },
  ]},
  { label: 'Accounting', items: [
    { key: 'journals', label: 'Journals',          icon: 'doc' },
    { key: 'coa',      label: 'Chart of accounts', icon: 'lines' },
    { key: 'rules',    label: 'Auto-cat rules',    icon: 'rule' },
    { key: 'budgets',  label: 'Budgets',           icon: 'house' },
  ]},
  { label: 'Reports', items: [
    { key: 'trial',    label: 'Trial balance', icon: 'page' },
    { key: 'pl',       label: 'Profit & loss', icon: 'chart' },
    { key: 'balance',  label: 'Balance sheet', icon: 'circle' },
    { key: 'payees',   label: 'Payee report',  icon: 'people' },
    { key: 'tax',      label: 'Tax tracker',   icon: 'tax' },
    { key: 'auditlog', label: 'Audit trail',   icon: 'audit' },
  ]},
  { label: null, items: [
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ]},
];

function NavIcon({ name }) {
  const paths = {
    dashboard: <><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/></>,
    list:      <path d="M1 3.5h12M1 7h8M1 10.5h10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>,
    check:     <path d="M2 7l3 3 7-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>,
    upload:    <><path d="M7 1v8M4 4l3-3 3 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 10v2h10v-2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    bank:      <><rect x="1" y="5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M7 2l6 3H1l6-3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/><path d="M4 9v2M7 9v2M10 9v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    doc:       <><path d="M2 1h10v12H2z" stroke="currentColor" strokeWidth="1.1"/><path d="M5 4h4M5 7h4M5 10h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    lines:     <path d="M1 2h12M1 5h8M1 8h10M1 11h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>,
    rule:      <><path d="M2 4h3M2 7h5M2 10h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><path d="M9 5l3 2-3 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></>,
    house:     <><path d="M1 11V5l6-4 6 4v6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 11V8h4v3" stroke="currentColor" strokeWidth="1.1"/></>,
    page:      <><path d="M3 2h8v10H3z" stroke="currentColor" strokeWidth="1.1"/><path d="M5 5h4M5 7.5h4M5 10h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    chart:     <path d="M1 11l3-4 3 2 5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>,
    circle:    <><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1"/><path d="M7 4v6M4.5 7h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    people:    <><circle cx="5" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.1"/><path d="M1 11c0-2.2 1.8-4 4-4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><circle cx="10" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.1"/><path d="M7.5 13c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    tax:       <><path d="M2 2h10v10H2z" stroke="currentColor" strokeWidth="1.1"/><path d="M5 9l4-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/></>,
    settings:  <><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.1"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.1 1.1M9.9 9.9l1.1 1.1M2.9 11.1l1.1-1.1M9.9 4.1l1.1-1.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    audit:     <><path d="M9 2H3v10h8V5L9 2z" stroke="currentColor" strokeWidth="1.1"/><path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.1"/><path d="M5 6h4M5 8h4M5 10h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
    collapse:  <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>,
    expand:    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>,
  };
  return (
    <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14, flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
}

export function Sidebar({ currentView, onNavigate, badges = {}, user, orgName, onSignOut }) {
  const { transactions, dateFrom, dateTo, fyMode } = useApp();
  const footerPeriod = typeof fyMode === 'number' ? fyLabel(fyMode) : dateRangeLabel(dateFrom, dateTo);

  // Collapsed state — persisted so it survives refresh
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sb_collapsed') === 'true'
  );

  // Track dark mode for icon switching
  const [isDark, setIsDark] = useState(
    document.documentElement.getAttribute('data-theme') === 'dark'
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  function toggleCollapse() {
    setCollapsed(v => {
      const next = !v;
      localStorage.setItem('sb_collapsed', next ? 'true' : 'false');
      return next;
    });
  }

  return (
    <aside className={`sb${collapsed ? ' sb--collapsed' : ''}`}>

      {/* Brand + collapse toggle */}
      <div className="sb-top">
        <div className="sb-mark">
          <img
            src={isDark ? '/icon-dark.png' : '/icon-light.png'}
            alt="Moniqr"
            className="sb-logo"
          />
          {!collapsed && <span className="sb-name">Moniqr</span>}
        </div>
        {!collapsed && <div className="sb-sub">{orgName || 'Personal accounts'}</div>}
        <button
          className="sb-toggle"
          onClick={toggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <NavIcon name={collapsed ? 'expand' : 'collapse'} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sb-nav">
        {NAV_GROUPS.map((group, gi) => (
          <div className="sb-group" key={group.label || `g${gi}`}>
            {group.label && !collapsed && <div className="sb-gl">{group.label}</div>}
            {group.items.map(item => {
              const hasBadge  = item.badge  && badges[item.badge]  > 0;
              const hasBadge2 = item.badge2 && badges[item.badge2] > 0;
              return (
                <div
                  key={item.key}
                  className={`sb-item${currentView === item.key ? ' active' : ''}`}
                  onClick={() => onNavigate(item.key)}
                  title={collapsed ? item.label : undefined}
                  role="button"
                  aria-current={currentView === item.key ? 'page' : undefined}
                >
                  <NavIcon name={item.icon} />
                  {!collapsed && <span className="sb-item-label">{item.label}</span>}
                  {!collapsed && hasBadge  && <Badge count={badges[item.badge]}  red={item.badge === 'approve'} />}
                  {!collapsed && hasBadge2 && <Badge count={badges[item.badge2]} red />}
                  {collapsed && (hasBadge || hasBadge2) && (
                    <span className="sb-dot" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="sb-foot">
          <p>{footerPeriod}</p>
          <p><span>{transactions?.length || 0}</span> transactions</p>
          {user && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <p style={{ marginBottom: 4, fontSize: 10.5 }}>{user.email}</p>
              <button onClick={onSignOut} className="sb-signout">Sign out</button>
            </div>
          )}
        </div>
      )}

      {/* Collapsed footer — just sign out icon */}
      {collapsed && user && (
        <div className="sb-foot sb-foot--collapsed">
          <button onClick={onSignOut} className="sb-signout-icon" title="Sign out" aria-label="Sign out">
            <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14 }}>
              <path d="M5 2H2v10h3M10 5l3 2-3 2M6 7h7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
}
