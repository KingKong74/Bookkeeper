/**
 * utils/pdfParser.js
 * ------------------
 * Parses ANZ Credit Card and ANZ Plus (Flex Saver / savings) PDF statements.
 *
 * ANZ CC format:
 *   Date Processed | Date of Transaction | Card(4) | Description | Amount[$CR] | Balance
 *
 * ANZ Plus format:
 *   Date (DD Mon, no year) | Description | Credit | Debit | Balance
 *   Year is inferred from the statement period header.
 *   "PAYMENT FROM ..." = credit (positive)
 *   "PAYMENT TO ..." / "BPAY TO ..." = debit (negative)
 *   Multi-line descriptions and "Effective Date" rows are merged.
 */

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE    = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

let _loadPromise = null;
function loadPdfJs() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      return resolve(window.pdfjsLib);
    }
    const script  = document.createElement('script');
    script.src    = `${PDFJS_BASE}/pdf.min.js`;
    script.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) return reject(new Error('pdf.js loaded but window.pdfjsLib not found'));
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Could not load pdf.js from CDN'));
    document.head.appendChild(script);
  });
  return _loadPromise;
}

// ── Extract positioned items ──────────────────────────────────────────────────
async function extractItems(file) {
  const lib         = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await lib.getDocument({ data: arrayBuffer }).promise;
  const pages       = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter(i => i.str?.trim())
        .map(i => ({
          text: i.str.trim(),
          x:    Math.round(i.transform[4]),
          y:    Math.round(i.transform[5]),
        }))
    );
  }
  return pages;
}

// ── Group items into rows by Y coordinate (±6px) ─────────────────────────────
function groupRows(items, tol = 6) {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let row = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - row[0].y) <= tol) { row.push(sorted[i]); }
    else { rows.push(row.sort((a,b) => a.x - b.x)); row = [sorted[i]]; }
  }
  if (row.length) rows.push(row.sort((a,b) => a.x - b.x));
  return rows;
}

// ── Merge standalone "CR" tokens onto preceding amount ───────────────────────
function mergeCR(items) {
  const r = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].text.toUpperCase() === 'CR' && r.length > 0 && /^\$?[\d,]+\.\d{2}$/.test(r[r.length-1].text)) {
      r[r.length-1] = { ...r[r.length-1], text: r[r.length-1].text + ' CR' };
    } else { r.push(items[i]); }
  }
  return r;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
const MON = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };

function parseDateFull(s) {
  const m = (s||'').trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const yr = m[3].length===2 ? `20${m[3]}` : m[3];
  return `${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

function parseDateShort(s, year) {
  const m = (s||'').trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})$/);
  if (!m) return null;
  const mo = MON[m[2].toLowerCase().slice(0,3)];
  return mo ? `${year}-${mo}-${m[1].padStart(2,'0')}` : null;
}

const DATE_FULL_RE  = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const DATE_SHORT_RE = /^\d{1,2}\s+[A-Za-z]{3,9}$/;
const AMT_RE        = /^\$?[\d,]+\.\d{2}(\s*CR)?$/i;

function parseAmt(s) {
  const m = (s||'').trim().replace(/\s/g,'').match(/^\$?([\d,]+\.\d{2})(CR)?$/i);
  return m ? { value: parseFloat(m[1].replace(/,/g,'')), isCredit: !!m[2] } : null;
}

// ── Statement type detection ──────────────────────────────────────────────────
function detectType(pages) {
  const flat = pages.flatMap(p => p.map(i => i.text)).join(' ').toLowerCase();
  if (flat.includes('flex saver') || flat.includes('anz plus') || flat.includes('branch number (bsb)')) return 'anz_plus';
  if (flat.includes('credit limit') || flat.includes('cash advances') || flat.includes('anz first') || flat.includes('minimum monthly payment')) return 'anz_cc';
  return 'generic';
}

// ── Summary extraction ────────────────────────────────────────────────────────
function extractSummary(pages) {
  const flat = pages.flatMap(p => p.map(i => i.text)).join(' ');

  // "28 February 2026 - 31 March 2026" or "09/02/2026 to 08/03/26"
  const p1 = flat.match(/(\d{1,2}\s+\w+\s+\d{4})\s*[-–to]+\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  const p2 = flat.match(/(\d{2}\/\d{2}\/\d{2,4})\s+to\s+(\d{2}\/\d{2}\/\d{2,4})/i);

  // Extract end year for ANZ Plus short-date inference
  let endYear = new Date().getFullYear();
  if (p1) { const m = p1[2].match(/(\d{4})/); if (m) endYear = parseInt(m[1]); }

  const opening = flat.match(/opening\s+balance[^$\d]*\$?([\d,]+\.\d{2})/i);
  const closing = flat.match(/closing\s+balance[^$\d]*\$?([\d,]+\.\d{2})/i);

  return {
    period:         p1 ? `${p1[1]} – ${p1[2]}` : (p2 ? `${p2[1]} – ${p2[2]}` : null),
    openingBalance: opening ? parseFloat(opening[1].replace(/,/g,'')) : null,
    closingBalance: closing ? parseFloat(closing[1].replace(/,/g,'')) : null,
    endYear,
  };
}

// ── ANZ CC parser ─────────────────────────────────────────────────────────────
function parseANZCC(rows) {
  const txns = [];
  for (const rawRow of rows) {
    const row = mergeCR(rawRow);
    const t   = row.map(r => r.text);
    if (row.length < 4) continue;
    if (!DATE_FULL_RE.test(t[0]) || !DATE_FULL_RE.test(t[1])) continue;
    if (t.some(x => /^(Date|Processed|Transaction|Balance|Interest Rate|Page \d)/i.test(x))) continue;
    if (t.some(x => /^(Please check|Account Number|Cheque)/i.test(x))) continue;

    let balIdx = -1, amtIdx = -1;
    for (let i = t.length-1; i >= 0; i--) {
      if (AMT_RE.test(t[i].replace(/\s/g,''))) {
        if (balIdx === -1) { balIdx = i; continue; }
        if (amtIdx === -1) { amtIdx = i; break; }
      }
    }
    if (amtIdx < 0 || balIdx < 0) continue;

    const date = parseDateFull(t[1]); if (!date) continue;
    const ds   = /^\d{4}$/.test(t[2]) ? 3 : 2;
    const desc = t.slice(ds, amtIdx).join(' ').trim();
    if (!desc || desc.length < 2) continue;
    if (/INCL OVERSEAS TXN|interest rate|^page \d/i.test(desc)) continue;

    const a = parseAmt(t[amtIdx]); if (!a) continue;
    txns.push({ date, desc, amt: a.isCredit ? a.value : -a.value });
  }
  return txns;
}

// ── Merge split date tokens in a row ─────────────────────────────────────────
// pdf.js sometimes splits "31 Mar" into ["31", "Mar"] as separate items.
// This function merges a leading digit token with the following month token.
function mergeRowDateTokens(items) {
  if (items.length < 2) return items;
  const result = [];
  let i = 0;
  while (i < items.length) {
    const curr = items[i];
    const next = items[i + 1];
    // If current is 1-2 digits and next is a 3-9 letter month abbreviation
    if (
      /^\d{1,2}$/.test(curr.text) &&
      next && /^[A-Za-z]{3,9}$/.test(next.text) &&
      MON[next.text.toLowerCase().slice(0, 3)]
    ) {
      // Merge into "DD Mon"
      result.push({ ...curr, text: `${curr.text} ${next.text}` });
      i += 2;
    } else {
      result.push(curr);
      i++;
    }
  }
  return result;
}

// ── ANZ Plus parser ───────────────────────────────────────────────────────────
// Layout: [DD Mon] [Description words...] [Credit$?] [Debit$?] [Balance$]
// Key insight: description keyword tells us direction
//   "PAYMENT FROM" / "TRANSFER FROM" / "FUNDS RETURNED" / "CREDIT" → positive (credit)
//   "PAYMENT TO" / "BPAY TO" → negative (debit)
// X-position fallback: credit col ~x<470, debit col ~x≥470 on typical ANZ Plus layout
function parseANZPlus(rows, endYear) {
  const txns = [];

  // First pass: identify all rows that start with a short date
  // Then merge continuation rows (multi-line descriptions + "Effective Date" rows)
  const dateRows = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const t0  = row[0]?.text || '';
    if (!DATE_SHORT_RE.test(t0)) continue;
    if (row.map(r => r.text).some(x => /^(Date|Description|Credit|Debit|Balance)$/i.test(x))) continue;

    // Collect continuation rows (no date, contains amounts or desc text) until next date row
    const merged = [...row];
    let j = i + 1;
    while (j < rows.length) {
      const nxt = rows[j];
      const n0  = nxt[0]?.text || '';
      // Stop if next row starts with a date
      if (DATE_SHORT_RE.test(n0)) break;
      // Stop if it looks like a page header
      if (/^(ANZ Plus|Account Statement|Date|Please check|Opening Balance|Australia)/i.test(n0)) break;
      // "Effective Date" rows are metadata — include their date as note but don't add new txn
      // Skip them (they don't add amounts)
      if (/^Effective Date/i.test(n0)) { j++; continue; }
      // Otherwise merge into current row (multi-line description)
      merged.push(...nxt);
      j++;
    }

    const texts = merged.map(r => r.text);
    const xs    = merged.map(r => r.x);

    // Find amount columns — scan right-to-left, collect up to 3 dollar amounts
    // Store BOTH the parsed value AND the x position
    const amtItems = [];
    for (let k = texts.length - 1; k >= 1; k--) {
      const parsed = parseAmt(texts[k]);   // ← actually call parseAmt to get value
      if (parsed) {
        amtItems.unshift({ ...parsed, x: xs[k], idx: k });
        if (amtItems.length >= 3) break;
      }
    }
    if (amtItems.length < 2) continue;   // need at least txnAmt + balance

    const date = parseDateShort(texts[0], endYear);
    if (!date) continue;

    // Description = everything between date col and first amount col
    const firstAmtIdx = amtItems[0].idx;
    const desc = texts.slice(1, firstAmtIdx).join(' ').trim().replace(/\s+/g, ' ');
    if (!desc || desc.length < 2) continue;

    // Skip header/footer noise
    if (/^(ANZ Plus|Account Statement|Branch|BSB|Interest Earned|Transactions|Opening|Closing|Australia)/i.test(desc)) continue;

    // Sign determination — description keyword is the most reliable signal
    const isCredit = /^(PAYMENT FROM|TRANSFER FROM|FUNDS RETURNED|CREDIT|INTEREST PAID)/i.test(desc);
    const isDebit  = /^(PAYMENT TO|BPAY TO)/i.test(desc);

    let amt;
    if (amtItems.length === 2) {
      // [txnAmt, balance] — only one transaction amount
      const txnVal = amtItems[0].value;
      if (isCredit)     amt =  txnVal;
      else if (isDebit) amt = -txnVal;
      else              amt = amtItems[0].x < 470 ? txnVal : -txnVal;
    } else {
      // [creditAmt, debitAmt, balance] — two transaction columns
      const cv = amtItems[0].value;  // leftmost = credit col
      const dv = amtItems[1].value;  // next     = debit col
      if      (cv > 0 && dv === 0) amt =  cv;   // credit only
      else if (dv > 0 && cv === 0) amt = -dv;   // debit only
      else if (isCredit)            amt =  Math.max(cv, dv);
      else if (isDebit)             amt = -Math.max(cv, dv);
      else                          amt = amtItems[0].x < 470 ? cv : -dv;
    }

    if (!amt || isNaN(amt)) continue;
    txns.push({ date, desc, amt });
  }
  return txns;
}

// ── Generic fallback ──────────────────────────────────────────────────────────
function parseGeneric(rows) {
  const txns = [];
  for (const rawRow of rows) {
    const row = mergeCR(rawRow);
    const t   = row.map(r => r.text);
    if (!DATE_FULL_RE.test(t[0])) continue;
    const date = parseDateFull(t[0]); if (!date) continue;
    let amtIdx = -1;
    for (let i = t.length-1; i >= 1; i--) { if (AMT_RE.test(t[i].replace(/\s/g,''))) { amtIdx = i; break; } }
    if (amtIdx < 1) continue;
    const desc = t.slice(1, amtIdx).join(' ').trim(); if (!desc || desc.length < 2) continue;
    const a = parseAmt(t[amtIdx]); if (!a) continue;
    txns.push({ date, desc, amt: a.isCredit ? a.value : -a.value });
  }
  return txns;
}

// ── Deduplication (occurrence-count aware) ────────────────────────────────────
function dedup(transactions, existing) {
  const results = [];
  let duplicateCount = 0;
  const occ = {};
  const tagged = transactions.map(t => {
    const base = `${t.date}|${t.desc.toLowerCase()}|${t.amt.toFixed(2)}`;
    occ[base]  = (occ[base]||0) + 1;
    return { ...t, _key: `${base}#${occ[base]}` };
  });
  const seen = new Set();
  const deduped = tagged.filter(t => { if (seen.has(t._key)) return false; seen.add(t._key); return true; });
  const exOcc = {};
  for (const e of existing) {
    const k = `${e.date}|${(e.desc||e.description||'').toLowerCase()}|${parseFloat(e.amt??e.amount??0).toFixed(2)}`;
    exOcc[k] = (exOcc[k]||0)+1;
  }
  const impOcc = {};
  for (const t of deduped) {
    const base = `${t.date}|${t.desc.toLowerCase()}|${t.amt.toFixed(2)}`;
    impOcc[base] = (impOcc[base]||0)+1;
    if (impOcc[base] <= (exOcc[base]||0)) { duplicateCount++; continue; }
    results.push({ ...t, cat: null, payee: '', note: '' });
  }
  return { results, duplicateCount };
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function parsePDF(file, existing = []) {
  const pages   = await extractItems(file);
  const allRows = pages.flatMap(p => groupRows(p, 6));
  const type    = detectType(pages);
  const summary = extractSummary(pages);

  // Log sample rows as strings for easier debugging
  const sampleStr = allRows.slice(0,20).map((r,i) => `  ${i}: ${r.map(x=>x.text).join(' | ')}`).join('\n');
  console.group(`PDF Import — ${file.name} (detected: ${type})`);
  console.log('Pages:', pages.length, '| Rows:', allRows.length);
  console.log('Summary:', summary);
  console.log('Sample rows (first 20):\n' + sampleStr);
  console.groupEnd();

  let raw = [];
  if      (type === 'anz_cc')   raw = parseANZCC(allRows);
  else if (type === 'anz_plus') raw = parseANZPlus(allRows, summary.endYear);

  if (raw.length === 0) raw = parseGeneric(allRows);
  console.log(`Parser result: ${raw.length} transactions`);

  const { results, duplicateCount } = dedup(raw, existing);
  return { transactions: results, duplicateCount, summary, debugRows: allRows };
}
