/**
 * components/ui/PeriodBar.jsx
 * ---------------------------
 * The date-range control bar shown at the top of every report and banking view.
 *
 * Features:
 *   - From / To date pickers
 *   - Financial Year quick-select buttons (current + previous 2 FYs)
 *   - "Custom" mode when the user manually changes dates
 *
 * Reads and writes dateFrom / dateTo / fyMode from AppContext.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { currentFYStart, fyLabel, fyDateRange } from '../../utils/helpers';

export function PeriodBar() {
  const { dateFrom, setDateFrom, dateTo, setDateTo, fyMode, setFyMode } = useApp();

  const currentFY = currentFYStart();
  const fyOptions = [currentFY, currentFY - 1, currentFY - 2];

  // ── When a FY button is clicked ──────────────────────────────────────────
  function handleFYClick(fyStart) {
    const { from, to } = fyDateRange(fyStart);
    setDateFrom(from);
    setDateTo(to);
    setFyMode(fyStart);
  }

  // ── When the user manually changes a date input ──────────────────────────
  function handleFromChange(e) {
    setDateFrom(e.target.value);
    setFyMode('custom');
  }
  function handleToChange(e) {
    setDateTo(e.target.value);
    setFyMode('custom');
  }

  return (
    <div className="pb">
      <label>From</label>
      <input className="pdate" type="date" value={dateFrom} onChange={handleFromChange} />
      <span style={{ color: 'var(--sand4)' }}>→</span>
      <label>To</label>
      <input className="pdate" type="date" value={dateTo} onChange={handleToChange} />

      <div className="fy-row">
        {fyOptions.map(fy => (
          <button
            key={fy}
            className={`fy-btn${fyMode === fy ? ' on' : ''}`}
            onClick={() => handleFYClick(fy)}
          >
            {fyLabel(fy)}
          </button>
        ))}
        <button className={`fy-btn${fyMode === 'custom' ? ' on' : ''}`}>
          Custom
        </button>
      </div>
    </div>
  );
}
