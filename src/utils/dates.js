/**
 * utils/dates.js
 * --------------
 * Pure date formatting and financial-year helpers.
 * All functions are deterministic — same input, same output.
 */

/** Current Australian financial year start (July 1) */
export function currentFYStart() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** ISO date range for a given FY start year */
export function fyDateRange(fyStart) {
  return {
    from: `${fyStart}-07-01`,
    to:   `${fyStart + 1}-06-30`,
  };
}

/** Human label for a FY range */
export function fyLabel(fyStart) {
  return `FY${String(fyStart).slice(2)}/${String(fyStart + 1).slice(2)}`;
}

/** Human label for an arbitrary date range */
export function dateRangeLabel(from, to) {
  if (!from || !to) return '';
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(f)} – ${fmt(t)}`;
}

/** Parse various date formats from CSV imports → ISO YYYY-MM-DD */
export function parseCSVDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Already ISO: 2024-07-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (mdy) {
    const yr = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${yr}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  }
  // Fall back to Date constructor
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

/** True if a date string falls within [from, to] inclusive */
export function isInDateRange(dateStr, from, to) {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}

/** Get prior period dates of equal length, immediately before `from` */
export function getPriorPeriod(from, to) {
  const f = new Date(from);
  const t = new Date(to);
  const days = Math.round((t - f) / 86400000);
  const priorTo   = new Date(f - 86400000);
  const priorFrom = new Date(priorTo - days * 86400000);
  return {
    from: priorFrom.toISOString().slice(0, 10),
    to:   priorTo.toISOString().slice(0, 10),
  };
}
