/**
 * views/Banking/ImportStatement.jsx
 * Supports CSV and PDF — with account selector, full review table,
 * reconciliation, auto-cat preview, per-row exclusion, CSV export.
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { parseCSVText, autoDetectColumns, buildTransactions } from '../../utils/csvParser';
import { parsePDF } from '../../utils/pdfParser';
import { bulkImportTransactions, upsertPayee } from '../../lib/supabase';
import { fmt, runAutoCatRules } from '../../utils/helpers';

const fmtAmt = n => (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function exportCSV(transactions, filename) {
  const rows = transactions.map(t => [t.date, `"${(t.desc||'').replace(/"/g,'""')}"`, t.amt.toFixed(2), t.amt>=0?'Credit':'Debit']);
  const csv  = [['Date','Description','Amount','Type'], ...rows].map(r => r.join(',')).join('\n');
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

function exportDebugCSV(rows, filename) {
  const max  = Math.max(...rows.map(r => r.length));
  const hdrs = ['Row', ...Array.from({length:max}, (_,i) => `Col${i+1}`)];
  const body = rows.map((r,i) => [i+1, ...r.map(x => `"${x.text.replace(/"/g,'""')}"`)] );
  const csv  = [hdrs, ...body].map(r => r.join(',')).join('\n');
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

export function ImportStatement({ onNavigate }) {
  const { txns, catMap, rules, payees, setPayees, setTxns, toast, org, accounts: _accts, PALETTE } = useApp();
  const accounts = _accts || [];

  // ── State ────────────────────────────────────────────────────────────────
  const [step,            setStep]           = useState('upload');
  const [fileType,        setFileType]        = useState('');
  const [filename,        setFilename]        = useState('');
  const [loading,         setLoading]         = useState(false);
  const [selectedAccount,  setSelectedAccount]  = useState('');  // account_id or ''
  const [newPayeesFound,   setNewPayeesFound]   = useState([]);   // payee names to offer adding
  const [importData,      setImportData]      = useState(null);
  const [excluded,        setExcluded]        = useState(new Set());

  // ── Auto-cat preview ─────────────────────────────────────────────────────
  const autoCatMap = useMemo(() => {
    if (!importData?.transactions || !(rules||[]).length) return {};
    const adapted  = importData.transactions.map((t,i) => ({ id:`import_${i}`, cat:null, desc:t.desc, amt:t.amt, date:t.date }));
    const sugs     = runAutoCatRules(adapted, rules);
    const map = {};
    sugs.forEach(s => { map[s.txnId] = s; });
    return map;
  }, [importData, rules]);

  // ── Reconciliation ────────────────────────────────────────────────────────
  const reconciliation = useMemo(() => {
    if (!importData?.summary) return null;
    const { openingBalance, closingBalance } = importData.summary;
    if (openingBalance == null || closingBalance == null) return null;
    const included    = (importData.transactions||[]).filter((_,i) => !excluded.has(i));
    const sumOfTxns   = included.reduce((s,t) => s + t.amt, 0);
    const expectedMove = closingBalance - openingBalance;
    const diff        = Math.abs(Math.abs(sumOfTxns) - Math.abs(expectedMove));
    return { openingBalance, closingBalance, expectedMove, sumOfTxns, diff, balanced: diff < 0.05,
      totalCredits: included.filter(t=>t.amt>0).reduce((s,t)=>s+t.amt,0),
      totalDebits:  Math.abs(included.filter(t=>t.amt<0).reduce((s,t)=>s+t.amt,0)) };
  }, [importData, excluded]);

  // ── Column map update (CSV) ───────────────────────────────────────────────
  function updateColMap(key, val) {
    const newMap = { ...importData.colMap, [key]: parseInt(val) };
    const { transactions } = buildTransactions(importData.rows, newMap, txns);
    setImportData(p => ({ ...p, transactions, colMap: newMap }));
    setExcluded(new Set());
  }

  // ── File handler ──────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;
    setFilename(file.name);
    setExcluded(new Set());
    const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    if (isPDF) {
      setFileType('pdf'); setLoading(true);
      try {
        const result = await parsePDF(file, txns);
        setImportData({ transactions: result.transactions, summary: result.summary ?? null, debugRows: result.debugRows ?? null, headers: null, rows: null, colMap: null });
        setStep('review');
      } catch(e) { toast('Could not parse PDF: ' + e.message); }
      finally { setLoading(false); }
    } else {
      setFileType('csv');
      const reader = new FileReader();
      reader.onload = e => {
        const { headers, rows } = parseCSVText(e.target.result);
        const colMap = autoDetectColumns(headers, file.name);
        const { transactions } = buildTransactions(rows, colMap, txns);
        setImportData({ transactions, summary: null, debugRows: null, headers, rows, colMap });
        setStep('review');
      };
      reader.readAsText(file);
    }
  }

  function toggleRow(i)  { setExcluded(p => { const n=new Set(p); n.has(i)?n.delete(i):n.add(i); return n; }); }
  function toggleAll(on) { setExcluded(on ? new Set() : new Set((importData?.transactions||[]).map((_,i)=>i))); }
  function reset()       { setStep('upload'); setImportData(null); setFilename(''); setFileType(''); setExcluded(new Set()); }

  // ── Import ────────────────────────────────────────────────────────────────
  async function doImport() {
    if (!org) { toast('No organisation found.'); return; }
    setLoading(true);
    try {
      const toImport = (importData?.transactions||[])
        .filter((_,i) => !excluded.has(i))
        .map(t => ({ ...t, account_id: selectedAccount || null }));
      if (toImport.length === 0) { toast('No transactions selected.'); return; }
      const { inserted, linked, skipped } = await bulkImportTransactions(org.id, toImport);
      const parts = [`Imported ${inserted} transaction${inserted!==1?'s':''}`];
      if (linked)  parts.push(`${linked} existing linked to account`);
      if (skipped) parts.push(`${skipped} duplicates skipped`);
      // Detect new payees from the imported descriptions using rules
      const newPayeeNames = new Set();
      toImport.forEach(t => {
        const matchedRule = (rules||[]).find(r => t.desc?.toLowerCase().includes(r.keyword?.toLowerCase()) && r.payee);
        if (matchedRule?.payee) {
          const existing = (payees||[]).find(p => p.name.toLowerCase() === matchedRule.payee.toLowerCase());
          if (!existing) newPayeeNames.add(matchedRule.payee);
        }
      });
      if (newPayeeNames.size > 0) {
        setNewPayeesFound([...newPayeeNames]);
      }

      toast(parts.join(' · ') + '.');
      // Reload transactions from DB so they appear immediately
      const { getTransactions } = await import('../../lib/supabase');
      const fresh = await getTransactions(org.id, '2000-01-01', '2099-12-31');
      const normalise = t => ({ ...t, cat:t.category_id??null, desc:t.description??'', amt:parseFloat(t.amount)??0, payee:t.payees?.name??t.payee??'', note:t.note??'' });
      setTxns(fresh.map(normalise));
      onNavigate('transactions');
    } catch(e) { toast('Import failed: ' + e.message); }
    finally { setLoading(false); }
  }

  const txnList      = importData?.transactions ?? [];
  const selectedRows = txnList.length - excluded.size;
  const allChecked   = excluded.size === 0;

  // ── Upload step ───────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div>
        <div className="card">
          <div className="ch"><h3>Import bank statement</h3></div>
          <div style={{ padding:20 }}>
            {/* Account selector */}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:500, color:'var(--stone)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Import to account</label>
              {accounts.length === 0 ? (
                <div style={{ padding:'10px 12px', background:'var(--sand2)', borderRadius:'var(--rr)', fontSize:12, color:'var(--stone)' }}>
                  No bank accounts yet. <span style={{ color:'var(--a)', cursor:'pointer' }} onClick={() => onNavigate('accounts')}>Add one first →</span>
                </div>
              ) : (
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  style={{ padding:'7px 10px', fontSize:13, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', color:'var(--ink)', fontFamily:'var(--font-sans)', width:'100%', maxWidth:320 }}
                >
                  <option value="">— No account (unlinked) —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type.replace('_',' ')})</option>)}
                </select>
              )}
            </div>

            <div style={{ marginBottom:14, padding:'10px 14px', background:'var(--al)', borderRadius:'var(--rr)', fontSize:12, color:'var(--a2)', lineHeight:1.6 }}>
              Supports <strong>PDF</strong> and <strong>CSV</strong> from ANZ, CBA, NAB, and Westpac.
              Auto-categorisation rules will be previewed before you confirm.
            </div>

            <div
              style={{ border:'1.5px dashed var(--sand4)', borderRadius:'var(--rl)', padding:'40px 20px', textAlign:'center', cursor:'pointer', background:'#FDFAF6', transition:'all 0.15s' }}
              onClick={() => document.getElementById('import-file-in').click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#BA7517'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor=''; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor=''; handleFile(e.dataTransfer.files[0]); }}
            >
              {loading ? <p style={{ fontSize:13, color:'var(--stone)' }}>Parsing…</p> : (
                <>
                  <p style={{ fontSize:13, color:'var(--stone2)', fontWeight:500 }}>Drop your statement here, or click to browse</p>
                  <span style={{ fontSize:12, color:'var(--stone)', display:'block', marginTop:6 }}>PDF or CSV · ANZ, CBA, NAB, Westpac</span>
                </>
              )}
            </div>
            <input type="file" id="import-file-in" accept=".csv,.pdf" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
          </div>
        </div>
      </div>
    );
  }

  // ── Review step ───────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>{filename}</div>
          <div style={{ fontSize:11.5, color:'var(--stone)', marginBottom:10 }}>
            {selectedRows} of {txnList.length} transactions selected
          </div>
          {/* Account selector — stays visible throughout review */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <label style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0 }}>
              Import to account:
            </label>
            {accounts.length === 0 ? (
              <span style={{ fontSize:12, color:'var(--stone)' }}>
                No accounts set up — transactions will be unlinked.
              </span>
            ) : (
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                style={{ padding:'5px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', color:'var(--ink)', fontFamily:'var(--font-sans)', minWidth:220 }}
              >
                <option value="">— No account (unlinked) —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type.replace('_',' ')})
                  </option>
                ))}
              </select>
            )}
            {selectedAccount && (
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'var(--al)', color:'var(--a2)', fontWeight:500 }}>
                ✓ Will link to {accounts.find(a=>a.id===selectedAccount)?.name}
              </span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <button className="btn" onClick={reset}>← Change file</button>
          <button className="btn btn-a" onClick={doImport} disabled={loading || selectedRows === 0}>
            {loading ? 'Importing…' : `Import ${selectedRows} transaction${selectedRows!==1?'s':''}`}
          </button>
        </div>
      </div>

      {/* CSV column mapping */}
      {fileType === 'csv' && importData?.colMap && (
        <div className="card" style={{ marginBottom:12 }}>
          <div className="ch"><h3>Column mapping</h3><p>{filename}</p></div>
          {[['date','Date'],['desc','Description'],['amt','Amount (single)'],['debit','Debit col'],['credit','Credit col']].map(([k,lbl]) => (
            <div key={k} style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:12, alignItems:'center', padding:'7px 14px', borderBottom:'0.5px solid var(--bd)' }}>
              <label style={{ fontSize:12, color:'var(--stone)' }}>{lbl}</label>
              <select value={importData.colMap[k]} onChange={e => updateColMap(k, e.target.value)}
                style={{ padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)', maxWidth:260 }}>
                <option value="-1">— ignore —</option>
                {importData.headers.map((h,i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Statement summary + reconciliation */}
      {importData?.summary && (
        <div className="card" style={{ marginBottom:12 }}>
          <div className="ch"><h3>Statement summary</h3><p>{importData.summary.period}</p></div>
          <div style={{ padding:'12px 14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:reconciliation?12:0 }}>
              {importData.summary.openingBalance != null && (
                <div style={{ background:'var(--sand)', borderRadius:'var(--rr)', padding:'10px 12px' }}>
                  <div style={{ fontSize:11, color:'var(--stone)', marginBottom:3, fontWeight:500 }}>Opening balance</div>
                  <div style={{ fontSize:16, fontWeight:500 }}>{fmt(importData.summary.openingBalance)}</div>
                </div>
              )}
              {importData.summary.closingBalance != null && (
                <div style={{ background:'var(--sand)', borderRadius:'var(--rr)', padding:'10px 12px' }}>
                  <div style={{ fontSize:11, color:'var(--stone)', marginBottom:3, fontWeight:500 }}>Closing balance</div>
                  <div style={{ fontSize:16, fontWeight:500 }}>{fmt(importData.summary.closingBalance)}</div>
                </div>
              )}
              <div style={{ background:'var(--sand)', borderRadius:'var(--rr)', padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'var(--stone)', marginBottom:3, fontWeight:500 }}>Transactions</div>
                <div style={{ fontSize:16, fontWeight:500 }}>{txnList.length}</div>
              </div>
              <div style={{ background:'var(--sand)', borderRadius:'var(--rr)', padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'var(--stone)', marginBottom:3, fontWeight:500 }}>Selected</div>
                <div style={{ fontSize:16, fontWeight:500 }}>{selectedRows}</div>
              </div>
            </div>
            {reconciliation && (
              <div style={{ padding:'10px 12px', borderRadius:'var(--rr)', background:reconciliation.balanced?'var(--gnb)':'var(--rdb)', color:reconciliation.balanced?'var(--gn)':'var(--rd)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{reconciliation.balanced?'✓':'⚠'}</span>
                  {reconciliation.balanced ? (
                    <div style={{ fontSize:12 }}>
                      <strong>Reconciled.</strong> Txn total {fmt(Math.abs(reconciliation.sumOfTxns))} matches statement movement {fmt(Math.abs(reconciliation.expectedMove))}.
                      <div style={{ marginTop:4, opacity:0.8 }}>Credits: {fmt(reconciliation.totalCredits)} · Debits: {fmt(reconciliation.totalDebits)}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize:12 }}>
                      <strong>Not reconciled</strong> — difference of <strong>{fmt(reconciliation.diff)}</strong>.
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:6 }}>
                        <div><div style={{ opacity:0.7, marginBottom:2 }}>Txn total</div><strong>{fmt(Math.abs(reconciliation.sumOfTxns))}</strong></div>
                        <div><div style={{ opacity:0.7, marginBottom:2 }}>Statement move</div><strong>{fmt(Math.abs(reconciliation.expectedMove))}</strong></div>
                        <div><div style={{ opacity:0.7, marginBottom:2 }}>Difference</div><strong>{fmt(reconciliation.diff)}</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transaction review table */}
      <div className="card">
        <div className="ch">
          <h3>Review transactions</h3>
          <p style={{ fontSize:11 }}>Uncheck rows to exclude</p>
          <div className="ch-r" style={{ gap:12, fontSize:12 }}>
            <span className="vp">↑ {txnList.filter(t=>t.amt>0).length} credits</span>
            <span className="vn">↓ {txnList.filter(t=>t.amt<0).length} debits</span>
          </div>
        </div>

        {txnList.length === 0 ? (
          <div style={{ padding:24, textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
            <p style={{ fontWeight:500, marginBottom:6 }}>No transactions found</p>
            <p style={{ fontSize:12, color:'var(--stone)', marginBottom:14 }}>The parser couldn't extract transactions. Try exporting a CSV from your bank.</p>
            <button className="btn" onClick={reset}>Try another file</button>
          </div>
        ) : (
          <div style={{ overflowX:'auto', maxHeight:520, overflowY:'auto' }}>
            <table style={{ minWidth:680 }}>
              <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                <tr>
                  <th style={{ width:32 }}><input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)} style={{ cursor:'pointer' }} /></th>
                  <th style={{ width:92 }}>Date</th>
                  <th>Description</th>
                  <th className="tr" style={{ width:105 }}>Amount</th>
                  <th style={{ width:160 }}>Auto-cat preview</th>
                  <th style={{ width:80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {txnList.map((t,i) => {
                  const isExcluded = excluded.has(i);
                  const sug        = autoCatMap[`import_${i}`];
                  const sugCat     = sug?.sugCat ? catMap[sug.sugCat] : null;
                  return (
                    <tr key={i} onClick={() => toggleRow(i)} style={{ opacity:isExcluded?0.4:1, transition:'opacity 0.1s', cursor:'pointer' }}>
                      <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={!isExcluded} onChange={() => toggleRow(i)} style={{ cursor:'pointer' }} /></td>
                      <td style={{ color:'var(--stone)', fontSize:12, whiteSpace:'nowrap' }}>{t.date}</td>
                      <td style={{ fontSize:12, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.desc}</td>
                      <td className={`tr ${t.amt>=0?'vp':'vn'}`} style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>{fmtAmt(t.amt)}</td>
                      <td>
                        {sugCat ? (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'1px 7px', borderRadius:99, fontSize:10.5, fontWeight:500, background:`${sugCat.col}18`, color:sugCat.col, border:`0.5px solid ${sugCat.col}44` }}>
                            <span style={{ width:5, height:5, borderRadius:'50%', background:sugCat.col, display:'inline-block' }} />{sugCat.l}
                          </span>
                        ) : <span style={{ fontSize:11, color:'var(--sand4)', fontStyle:'italic' }}>No match</span>}
                      </td>
                      <td>
                        <span style={{ fontSize:10.5, padding:'1px 7px', borderRadius:99, fontWeight:500, background:isExcluded?'var(--sand2)':'var(--gnb)', color:isExcluded?'var(--stone)':'var(--gn)' }}>
                          {isExcluded?'Skip':'Import'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'var(--sand)', borderTop:'0.5px solid var(--bd2)' }}>
                  <td colSpan={3} style={{ padding:'8px 12px', fontWeight:500, fontSize:12 }}>{selectedRows} selected · {excluded.size > 0 ? `${excluded.size} excluded` : 'all included'}</td>
                  <td className="tr" style={{ padding:'8px 12px', fontSize:12 }}>
                    <div className="vp">{fmtAmt(txnList.filter((_,i)=>!excluded.has(i)&&txnList[i].amt>0).reduce((s,t)=>s+t.amt,0))}</div>
                    <div className="vn">{fmtAmt(txnList.filter((_,i)=>!excluded.has(i)&&txnList[i].amt<0).reduce((s,t)=>s+t.amt,0))}</div>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Debug panel */}
      {txnList.length > 0 && (
        <details style={{ marginTop:10 }}>
          <summary style={{ fontSize:11, color:'var(--stone)', cursor:'pointer', padding:'4px 0', userSelect:'none' }}>
            🔧 Parser debug {importData?.debugRows ? `· ${importData.debugRows.length} raw rows` : ''}
          </summary>
          <div style={{ marginTop:8, background:'var(--sand)', borderRadius:'var(--rl)', border:'0.5px solid var(--bd)', overflow:'hidden' }}>
            <div style={{ padding:'8px 14px', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-sm" onClick={() => exportCSV(txnList, `${filename}-parsed.csv`)}>↓ Parsed CSV</button>
              {importData?.debugRows && <button className="btn btn-sm" onClick={() => exportDebugCSV(importData.debugRows, `${filename}-raw-rows.csv`)}>↓ Raw rows CSV</button>}
            </div>
            {importData?.debugRows && (
              <div style={{ padding:'8px 14px', fontSize:11, fontFamily:'monospace', maxHeight:200, overflowY:'auto', color:'var(--stone2)' }}>
                {importData.debugRows.slice(0,80).map((row,i) => {
                  const looksLikeTxn = /^\d{1,2}[\/\-\s][A-Za-z0-9]/.test(row[0]?.text||'');
                  return (
                    <div key={i} style={{ marginBottom:2, padding:'1px 4px', borderRadius:2, background:looksLikeTxn?'rgba(186,117,23,0.08)':'transparent', color:looksLikeTxn?'var(--ink)':'var(--stone)' }}>
                      <span style={{ color:'var(--sand4)', marginRight:6, minWidth:28, display:'inline-block' }}>#{i+1}</span>
                      {row.map(x=>x.text).join(' │ ')}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Bottom action bar */}
      {txnList.length > 0 && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, padding:'10px 14px', background:'#FDFAF6', border:'0.5px solid var(--bd)', borderRadius:'var(--rl)' }}>
          <div style={{ fontSize:12, color:'var(--stone)' }}>
            {Object.keys(autoCatMap).filter(k=>!excluded.has(parseInt(k.replace('import_','')))).length} rows will be auto-categorised.
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={reset}>Cancel</button>
            <button className="btn btn-a" onClick={doImport} disabled={loading || selectedRows === 0}>
              {loading ? 'Importing…' : `Import ${selectedRows} transaction${selectedRows!==1?'s':''}`}
            </button>
          </div>
        </div>
      )}
      {/* New payees discovered banner */}
      {newPayeesFound.length > 0 && (
        <div style={{ marginTop:12, padding:'12px 14px', background:'var(--al)', borderRadius:'var(--rl)', border:'0.5px solid var(--a2)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:12.5, color:'var(--a2)', flex:1 }}>
            <strong>{newPayeesFound.length} new payee{newPayeesFound.length>1?'s':''} found:</strong>{' '}
            {newPayeesFound.join(', ')}
          </span>
          <button className="btn btn-a btn-sm" onClick={async () => {
            const { upsertPayee: up } = await import('../../lib/supabase');
            for (const name of newPayeesFound) {
              const col = (PALETTE||[])[payees.length % (PALETTE||['#888']).length] || '#888';
              const p   = await up(org.id, name, col);
              setPayees(prev => prev.find(x=>x.id===p.id) ? prev : [...prev, p]);
            }
            toast(`${newPayeesFound.length} payee${newPayeesFound.length>1?'s':''} added.`);
            setNewPayeesFound([]);
          }}>Add all</button>
          <button className="btn btn-sm" onClick={() => setNewPayeesFound([])}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
