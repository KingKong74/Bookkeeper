/**
 * views/Accounting/Journals.jsx
 * -----------------------------------------------
 * Two views:
 *   General Ledger — consolidated account balances from all auto-cat journals
 *   Journal Entries — individual posted entries (manual + auto ledger)
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { createJournalEntry, updateJournalEntry } from '../../lib/supabase';
import { fmt } from '../../utils/helpers';

const BLANK_LINE = { ac:'', dr:'', cr:'' };
function newForm() {
  return { date: new Date().toISOString().slice(0,10), desc:'', ref:'', lines:[{...BLANK_LINE}] };
}

// ── Consolidate journal lines by account name ─────────────────────────────────
// Given an array of raw journal lines, sum DR and CR per account_name.
// Returns sorted rows: highest total first.
const TYPE_ORDER_GL = ['asset','liability','equity','income','expense'];

function consolidateLines(lines, catMap) {
  const map = {};
  for (const l of lines) {
    // Key by category_id if available, else account_name
    const key  = l.category_id ? `cat:${l.category_id}` : (l.bank_account_id ? `bank:${l.bank_account_id}` : `name:${l.account_name||'—'}`);
    const cat  = l.category_id && catMap ? catMap[l.category_id] : null;
    const name = cat ? (cat.l || cat.label) : (l.account_name || l.ac || '—');
    if (!map[key]) map[key] = {
      key, account_name: name,
      code:      cat?.code || null,
      type:      cat?.t || cat?.type || null,
      parent_id: cat?.parent_id || null,
      cat_id:    l.category_id || null,
      debit: 0, credit: 0
    };
    map[key].debit  += parseFloat(l.debit  || l.dr  || 0);
    map[key].credit += parseFloat(l.credit || l.cr  || 0);
  }
  const rows = Object.values(map).filter(r => r.debit > 0.005 || r.credit > 0.005);
  // Add synthetic parent rows for accounts that only appear as child rows
  if (catMap) {
    const rowIds = new Set(rows.map(r=>r.cat_id).filter(Boolean));
    [...new Set(rows.map(r=>r.parent_id).filter(Boolean))].forEach(pid => {
      if (rowIds.has(pid)) return;
      const parent = catMap[pid]; if (!parent) return;
      const kids = rows.filter(r=>r.parent_id===pid);
      const dr = kids.reduce((s,r)=>s+r.debit,0), cr = kids.reduce((s,r)=>s+r.credit,0);
      if (!dr && !cr) return;
      rows.push({ key:`cat:${pid}`, account_name:parent.l, code:parent.code||null,
        type:parent.t, parent_id:null, cat_id:pid, debit:dr, credit:cr, synthetic:true });
    });
  }
  rows.sort((a,b) => {
    const ta = TYPE_ORDER_GL.indexOf(a.type), tb = TYPE_ORDER_GL.indexOf(b.type);
    if (ta !== tb) return (ta===-1?99:ta) - (tb===-1?99:tb);
    // Synthetic parent rows go AFTER their children
    const aIsParent = a.synthetic && rows.some(r=>r.parent_id===a.cat_id);
    const bIsParent = b.synthetic && rows.some(r=>r.parent_id===b.cat_id);
    if (aIsParent && !bIsParent) return 1;
    if (bIsParent && !aIsParent) return -1;
    return (parseInt(a.code)||9999) - (parseInt(b.code)||9999);
  });
  return rows;
}

// ── General Ledger view ───────────────────────────────────────────────────────
function GeneralLedger({ journals, catMap, txns }) {
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState(new Set());

  function toggleAccount(key) {
    setExpanded(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // All raw lines from all active auto_category journals
  const allLines = useMemo(() =>
    journals
      .filter(j => j.status !== 'void' && (j.source === 'auto_category' || j.source === 'manual'))
      .flatMap(j => (j.journal_lines || j.lines || [])),
    [journals]
  );

  // Build a map: key → array of raw lines
  const linesByAccount = useMemo(() => {
    const map = {};
    for (const l of allLines) {
      const key = l.category_id ? `cat:${l.category_id}` : (l.bank_account_id ? `bank:${l.bank_account_id}` : `name:${l.account_name||'—'}`);
      if (!map[key]) map[key] = [];
      map[key].push(l);
    }
    return map;
  }, [allLines]);

  // Build txn lookup for quick access when expanding
  const txnById = useMemo(() => Object.fromEntries((txns||[]).map(t=>[t.id,t])), [txns]);

  const consolidated = useMemo(() => consolidateLines(allLines, catMap), [allLines, catMap]);

  // GL shows sub-accounts and standalone accounts — NOT synthetic parent summary rows
  const filtered = (search.trim()
    ? consolidated.filter(r => r.account_name.toLowerCase().includes(search.toLowerCase()) || (r.code||'').includes(search))
    : consolidated
  ).filter(r => !r.synthetic);

  const totalDR = filtered.filter(r=>!r.synthetic).reduce((s,r) => s+r.debit, 0);
  const totalCR = filtered.filter(r=>!r.synthetic).reduce((s,r) => s+r.credit, 0);
  const balanced = Math.abs(totalDR - totalCR) < 0.01;

  if (allLines.length === 0) {
    return (
      <div style={{ padding:24, textAlign:'center', color:'var(--stone)', fontSize:12 }}>
        <div style={{ fontSize:28, marginBottom:8 }}>📒</div>
        <p style={{ fontWeight:500, marginBottom:4 }}>General ledger is empty</p>
        <p>Assign categories to transactions to populate the ledger.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search + balance badge */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'0.5px solid var(--bd)', background:'var(--sand)' }}>
        <input
          placeholder="Search accounts…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding:'5px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)', width:220 }}
        />
        <span style={{ fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:600,
          background: balanced ? 'var(--gnb)' : 'var(--rdb)',
          color:      balanced ? 'var(--gn)'  : 'var(--rd)' }}>
          {balanced ? '✓ Balanced' : `⚠ Off by ${fmt(Math.abs(totalDR - totalCR))}`}
        </span>
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--stone)' }}>
          {filtered.length} accounts · {allLines.length} entries
        </span>
      </div>

      {/* Account rows — click to expand transactions */}
      {filtered.map((r, idx) => {
        const net      = r.credit - r.debit;
        const isExpand = expanded.has(r.key || r.account_name);
        const acctLines = linesByAccount[r.key || r.account_name] || [];
        // Get unique transactions for this account (by transaction_id)
        const txnLines = acctLines.filter(l => l.transaction_id);
        const noTxnLines = acctLines.filter(l => !l.transaction_id);
        const canExpand = acctLines.length > 0;

        return (
          <React.Fragment key={r.account_name}>
            {/* Account summary row */}
            <div
              onClick={() => canExpand && toggleAccount(r.key || r.account_name)}
              style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'7px 14px',
                borderBottom: r.synthetic ? '0.5px dashed var(--bd2)' : '0.5px solid var(--bd)',
                borderTop: r.synthetic ? '0.5px dashed var(--bd2)' : undefined,
                background: r.synthetic ? 'var(--sand)' : idx%2===0?'#FDFAF6':'var(--sand)',
                cursor:canExpand&&!r.synthetic?'pointer':'default', alignItems:'center',
                opacity: r.synthetic ? 0.7 : 1 }}
              onMouseEnter={e => { if(canExpand) e.currentTarget.style.background='var(--al)'; }}
              onMouseLeave={e => { e.currentTarget.style.background=idx%2===0?'#FDFAF6':'var(--sand)'; }}
            >
              <span style={{ fontSize:11, color:'var(--stone)' }}>{canExpand ? (isExpand?'▾':'▸') : ''}</span>
              <span style={{ display:'flex', alignItems:'center', gap:6, paddingLeft: 0 }}>
                
                {r.code && <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--stone)', flexShrink:0 }}>{r.code}</span>}
                <span style={{ fontWeight:r.synthetic?600:500, fontSize:12.5 }}>
                  {r.account_name}
                  {r.synthetic && <span style={{ fontSize:9, marginLeft:6, padding:'1px 5px', borderRadius:99, background:'var(--sand2)', color:'var(--stone)', fontWeight:500 }}>total</span>}
                </span>
              </span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                {r.debit > 0.005 ? fmt(r.debit) : <span style={{ color:'var(--sand4)' }}>—</span>}
              </span>
              <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                {r.credit > 0.005 ? fmt(r.credit) : <span style={{ color:'var(--sand4)' }}>—</span>}
              </span>
              <span className={net > 0 ? 'vp' : net < 0 ? 'vn' : ''} style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:12, fontWeight:500 }}>
                {net > 0.005 ? '+'+fmt(net) : net < -0.005 ? '-'+fmt(Math.abs(net)) : '—'}
              </span>
            </div>

            {/* Expanded: individual transactions */}
            {isExpand && (
              <div style={{ background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
                {/* Sub-header */}
                <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'4px 14px',
                  borderBottom:'0.5px solid var(--bd)', background:'var(--sand2)' }}>
                  <span/>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Transaction</span>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>DR</span>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>CR</span>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'right' }}>Date</span>
                </div>
                {(() => {
                  // Group by txn_id: reversal lines appear immediately after original
                  const grouped = {};
                  txnLines.forEach(l => {
                    const k = l.transaction_id;
                    if (!grouped[k]) grouped[k] = { orig:[], rev:[] };
                    if (l.is_reversal) grouped[k].rev.push(l); else grouped[k].orig.push(l);
                  });
                  const orderedLines = [];
                  Object.values(grouped).forEach(g => {
                    g.orig.forEach(l => orderedLines.push({ l, isRev:false }));
                    g.rev.forEach(l =>  orderedLines.push({ l, isRev:true  }));
                  });
                  return orderedLines.map(({ l, isRev }, li) => {
                    const txn = txnById[l.transaction_id];
                    return (
                      <div key={li} style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px',
                        padding:'5px 14px', borderBottom:'0.5px solid var(--bd)',
                        background: isRev ? 'rgba(163,45,45,0.06)' : li%2===0?'var(--sand)':'#FDFAF6' }}>
                        <span/>
                        <span style={{ fontSize:11.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          color:isRev?'var(--rd)':undefined, display:'flex', alignItems:'center', gap:6 }}>
                          {isRev && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--rdb)', color:'var(--rd)', fontWeight:600, flexShrink:0 }}>REV</span>}
                          {txn?.desc || l.account_name}
                          {!isRev && txn?.payee && <span style={{ color:'var(--stone)', marginLeft:6, fontSize:10 }}>{txn.payee}</span>}
                        </span>
                        <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:11.5, color:isRev?'var(--rd)':undefined }}>
                          {parseFloat(l.debit) > 0.005 ? fmt(parseFloat(l.debit)) : '—'}
                        </span>
                        <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:11.5, color:isRev?'var(--rd)':undefined }}>
                          {parseFloat(l.credit) > 0.005 ? fmt(parseFloat(l.credit)) : '—'}
                        </span>
                        <span style={{ textAlign:'right', fontSize:11, color:isRev?'var(--rd)':'var(--stone)' }}>{txn?.date || '—'}</span>
                      </div>
                    );
                  });
                })()}
                {noTxnLines.length > 0 && (
                  <div style={{ padding:'4px 14px 4px 42px', fontSize:11, color:'var(--stone)', fontStyle:'italic' }}>
                    +{noTxnLines.length} manual journal line{noTxnLines.length!==1?'s':''}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Totals footer */}
      <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 110px 110px 100px', padding:'8px 14px',
        borderTop:'1.5px solid var(--ink)', background:'var(--sand)', fontWeight:600 }}>
        <span/>
        <span>Total</span>
        <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalDR)}</span>
        <span style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:balanced?'var(--ink)':'var(--rd)' }}>{fmt(totalCR)}</span>
        <span/>
      </div>
    </div>
  );
}

// ── Journal entry list ────────────────────────────────────────────────────────
function JournalList({ journals, onEdit, onVoid, onUnvoid, catMap }) {
  const [expanded, setExpanded] = useState(new Set());

  const toggle = id => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (journals.length === 0) {
    return <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No entries posted yet.</div>;
  }

  return journals.map(j => {
    const rawLines   = (j.journal_lines || j.lines || []);
    const isAutoLedger = j.source === 'auto_category';
    const isReversal   = j.source === 'reversal';
    // For collapsed summary: consolidate by account (no reversal lines, just net balances)
    // For expanded detail: always show raw lines (so REV badge is visible)
    const displayLines = isAutoLedger ? consolidateLines(rawLines, catMap) : rawLines;
    const isExpanded   = expanded.has(j.id);
    const isVoid       = j.status === 'void';
    // Exclude reversal lines from header totals (they net to zero)
    const nonRevLines  = rawLines.filter(l=>!l.is_reversal);
    const totalDR      = nonRevLines.reduce((s,l)=>s+(parseFloat(l.debit||l.dr)||0),0);
    const totalCR      = nonRevLines.reduce((s,l)=>s+(parseFloat(l.credit||l.cr)||0),0);

    return (
      <div key={j.id} style={{ borderBottom:'0.5px solid var(--bd)', opacity:isVoid?0.5:1 }}>
        {/* Entry header — always visible */}
        <div style={{ padding:'11px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}
          onClick={() => toggle(j.id)}>
          <span style={{ fontSize:13, color:'var(--stone)', flexShrink:0 }}>{isExpanded ? '▾' : '▸'}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontWeight:500, fontSize:12.5 }}>{j.description || j.desc}</span>
              {j.ref && <span style={{ fontSize:10, color:'var(--stone)', background:'var(--sand2)', padding:'1px 7px', borderRadius:99 }}>{j.ref}</span>}
              {isAutoLedger && <span style={{ fontSize:10, background:'var(--al)', color:'var(--a2)', padding:'1px 7px', borderRadius:99, fontWeight:500 }}>Auto</span>}
              {isVoid && <span style={{ fontSize:10, background:'var(--rdb)', color:'var(--rd)', padding:'1px 7px', borderRadius:99, fontWeight:500 }}>VOID</span>}
            </div>
            <div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>
              {j.date}
              {isAutoLedger && (() => {
                const origCount = rawLines.filter(l=>!l.is_reversal).length;
                const revCount  = rawLines.filter(l=>!!l.is_reversal).length;
                return ` · ${origCount} entries${revCount>0?` · ${revCount} reversal${revCount>1?'s':''}`:''}`;
              })()}
              {j.void_reason && ` · ${j.void_reason}`}
            </div>
          </div>
          {/* Summary amounts */}
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:11.5, fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{fmt(totalDR)}</div>
            <div style={{ fontSize:10, color:'var(--stone)' }}>DR / CR</div>
          </div>
          {!isVoid && (
            <div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
              {!isAutoLedger && <button className="btn btn-sm" style={{ fontSize:10 }} onClick={() => onEdit(j)}>Edit</button>}
              {!isAutoLedger && <button className="btn btn-sm" style={{ fontSize:10, color:'var(--rd)' }} onClick={() => onVoid(j)}>Void</button>}
            </div>
          )}
        </div>

        {/* Expanded lines */}
        {isExpanded && (
          <div style={{ margin:'0 16px 12px', border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', background:'var(--sand)' }}>
              {['Account','Debit','Credit'].map((h,i) => (
                <div key={i} style={{ padding:'4px 10px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>0?'right':'left' }}>{h}</div>
              ))}
            </div>
            {(() => {
              // Group by account: sum originals and reversals separately
              // Each gets its own DR line and CR line (never on the same row)
              const accMap = {};
              rawLines.forEach(l => {
                const isRev = !!l.is_reversal;
                const cat = l.category_id && catMap ? catMap[l.category_id] : null;
                const key = l.category_id ? `cat:${l.category_id}` : l.bank_account_id ? `bank:${l.bank_account_id}` : `name:${l.account_name||'—'}`;
                const name = cat ? (cat.code ? `${cat.code} · ${cat.l}` : cat.l) : (l.account_name || '—');
                if (!accMap[key]) accMap[key] = { name, code: cat?.code||null, origDR:0, origCR:0, revDR:0, revCR:0 };
                if (isRev) {
                  accMap[key].revDR += parseFloat(l.debit||l.dr)||0;
                  accMap[key].revCR += parseFloat(l.credit||l.cr)||0;
                } else {
                  accMap[key].origDR += parseFloat(l.debit||l.dr)||0;
                  accMap[key].origCR += parseFloat(l.credit||l.cr)||0;
                }
              });

              const rows = [];
              const sortedAccs = Object.values(accMap).sort((a,b) => {
                const ca = parseInt((a.code||'').replace(/\/.*$/,''))||9999;
                const cb = parseInt((b.code||'').replace(/\/.*$/,''))||9999;
                return ca - cb;
              });
              // Render as classic journal: DR entries first (indented right), CR entries (indented left)
              sortedAccs.forEach((r, ai) => {
                const bg = ai%2===0?'#FDFAF6':'var(--sand)';
                if (r.origDR > 0.005) rows.push(
                  <div key={`${ai}od`} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd)', background:bg, alignItems:'center' }}>
                    <div style={{ padding:'5px 10px', fontSize:12.5, color:'var(--ink)' }}>{r.name}</div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{fmt(r.origDR)}</div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', color:'var(--stone)' }}>—</div>
                  </div>
                );
                if (r.origCR > 0.005) rows.push(
                  <div key={`${ai}oc`} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd)', background:bg, alignItems:'center' }}>
                    <div style={{ padding:'5px 10px 5px 28px', fontSize:12.5, color:'var(--ink)' }}>{r.name}</div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', color:'var(--stone)' }}>—</div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{fmt(r.origCR)}</div>
                  </div>
                );
                if (r.revDR > 0.005) rows.push(
                  <div key={`${ai}rd`} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd)', background:'rgba(163,45,45,0.06)', alignItems:'center' }}>
                    <div style={{ padding:'5px 10px', fontSize:12.5, color:'var(--rd)', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'var(--rd)', color:'#fff', fontWeight:700, flexShrink:0, letterSpacing:'0.04em' }}>REV</span>
                      {r.name}
                    </div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--rd)', fontWeight:500 }}>{fmt(r.revDR)}</div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', color:'var(--rd)' }}>—</div>
                  </div>
                );
                if (r.revCR > 0.005) rows.push(
                  <div key={`${ai}rc`} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd)', background:'rgba(163,45,45,0.06)', alignItems:'center' }}>
                    <div style={{ padding:'5px 10px 5px 28px', fontSize:12.5, color:'var(--rd)', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'var(--rd)', color:'#fff', fontWeight:700, flexShrink:0, letterSpacing:'0.04em' }}>REV</span>
                      {r.name}
                    </div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', color:'var(--rd)' }}>—</div>
                    <div style={{ padding:'5px 10px', fontSize:12.5, textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--rd)', fontWeight:500 }}>{fmt(r.revCR)}</div>
                  </div>
                );
              });
              return rows;
            })()}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px', borderTop:'0.5px solid var(--bd2)', background:'var(--sand)' }}>
              <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500 }}>Total</div>
              <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(totalDR)}</div>
              <div style={{ padding:'5px 10px', fontSize:12, fontWeight:500, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(totalCR)}</div>
            </div>
          </div>
        )}
      </div>
    );
  });
}

// ── Main Journals component ───────────────────────────────────────────────────
export function Journals() {
  const { cats, journals, setJournals, accounts, txns, org, toast } = useApp();
  const [tab,     setTab]     = useState('ledger'); // 'ledger' | 'entries'
  const [form,    setForm]    = useState(newForm());
  const [editing, setEditing] = useState(null);
  const [lineErrs,setLineErrs]= useState({});
  const [notice,  setNotice]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [showForm,setShowForm]= useState(false);

  const catMap       = Object.fromEntries((cats||[]).map(c=>[c.id,c]));
  const accountOptions = [...new Set((cats||[]).map(c => c.ac))].sort();

  const totalDr  = form.lines.reduce((s,l) => s + (parseFloat(l.dr)||0), 0);
  const totalCr  = form.lines.reduce((s,l) => s + (parseFloat(l.cr)||0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;

  function setMsg(type, msg) {
    setNotice({ type, msg });
    if (type === 'ok') setTimeout(() => setNotice(null), 3000);
  }
  function updLine(i, field, val) {
    setForm(f => ({ ...f, lines: f.lines.map((l,j) => j===i ? {...l,[field]:val} : l) }));
  }
  function addLine()    { setForm(f => ({ ...f, lines: [...f.lines, {...BLANK_LINE}] })); }
  function delLine(i)   { if (form.lines.length > 1) setForm(f => ({ ...f, lines: f.lines.filter((_,j) => j!==i) })); }

  function loadForEdit(j) {
    const lines = (j.journal_lines || j.lines || []);
    setForm({
      date:  j.date, desc:  j.description||j.desc||'', ref: j.ref||'',
      lines: lines.map(l => ({ ac: l.account_name||l.ac||'', dr: l.debit||l.dr||'', cr: l.credit||l.cr||'' })),
    });
    setEditing(j.id); setShowForm(true); setNotice(null); setLineErrs({});
  }

  async function postEntry() {
    const errs = {};
    form.lines.forEach((l,i) => { if (!l.ac) errs[i] = true; });
    if (Object.keys(errs).length) { setLineErrs(errs); setMsg('err','All lines need an account name.'); return; }
    if (!balanced) { setMsg('err','Journal is not balanced — debits must equal credits.'); return; }
    setSaving(true); setLineErrs({});
    try {
      const lines = form.lines.map((l,i) => ({
        account_name: l.ac, debit: parseFloat(l.dr)||0, credit: parseFloat(l.cr)||0, sort_order: i,
      }));
      if (editing) {
        await updateJournalEntry(editing, { date:form.date, description:form.desc, ref:form.ref||null }, lines);
        setJournals(prev => prev.map(j => j.id===editing
          ? { ...j, date:form.date, description:form.desc, desc:form.desc, ref:form.ref, journal_lines:lines, lines }
          : j));
        setMsg('ok','Journal updated.');
      } else {
        const entry = await createJournalEntry(org.id, { date:form.date, description:form.desc, ref:form.ref||null, lines });
        setJournals(prev => [{ ...entry, journal_lines:lines, lines }, ...prev]);
        setMsg('ok','Journal posted.');
      }
      setForm(newForm()); setEditing(null); setShowForm(false);
    } catch(e) { setMsg('err', e.message); }
    finally { setSaving(false); }
  }

  async function voidJournal(j) {
    const reason = window.prompt('Reason for voiding this entry:');
    if (reason === null) return;
    try {
      await updateJournalEntry(j.id, { status:'void', void_reason: reason || 'Voided by user' }, null);
      setJournals(prev => prev.map(x => x.id===j.id ? { ...x, status:'void', void_reason:reason } : x));
      toast('Journal entry voided.');
    } catch(e) { toast('Error: '+e.message); }
  }

  const activeJournals = useMemo(() => journals.filter(j=>j.status!=='void'), [journals]);
  const manualJournals   = useMemo(() => journals.filter(j=>j.source!=='auto_category'&&j.source!=='reversal'), [journals]);
  const reversalJournals = useMemo(() => journals.filter(j=>j.source==='reversal'), [journals]);

  return (
    <div>
      {/* ── Tabs ── */}
      <div style={{ display:'flex', borderBottom:'0.5px solid var(--bd)', marginBottom:16 }}>
        {[['ledger','📒 General Ledger'],['entries','📋 Journal Entries']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:'9px 16px', border:'none', background:'none', cursor:'pointer', fontSize:12.5, fontFamily:'var(--font-sans)',
              color:tab===t?'var(--ink)':'var(--stone)', fontWeight:tab===t?500:400,
              borderBottom:tab===t?'2px solid var(--a)':'2px solid transparent', marginBottom:-1 }}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, paddingBottom:8 }}>
          <button className="btn btn-a btn-sm" onClick={()=>{ setForm(newForm()); setEditing(null); setShowForm(v=>!v); setNotice(null); }}>
            {showForm ? 'Cancel' : '+ New journal entry'}
          </button>
        </div>
      </div>

      {/* ── New / Edit form ── */}
      {showForm && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch">
            <h3>{editing ? 'Edit journal entry' : 'New journal entry'}</h3>
            {notice && (
              <span style={{ fontSize:12, padding:'3px 10px', borderRadius:99,
                background:notice.type==='ok'?'var(--gnb)':'var(--rdb)',
                color:notice.type==='ok'?'var(--gn)':'var(--rd)', fontWeight:500 }}>
                {notice.msg}
              </span>
            )}
          </div>
          <div style={{ padding:'12px 14px' }}>
            {/* Header row */}
            <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 120px', gap:10, marginBottom:12 }}>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Description</label>
                <input type="text" value={form.desc} placeholder="e.g. Loan repayment" onChange={e=>setForm(f=>({...f,desc:e.target.value}))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Ref</label>
                <input type="text" value={form.ref} placeholder="INV-001" onChange={e=>setForm(f=>({...f,ref:e.target.value}))} />
              </div>
            </div>

            {/* Lines */}
            <div style={{ border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden', marginBottom:8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>
                {['#','Account','Debit','Credit',''].map((h,i)=>(
                  <div key={i} style={{ padding:'5px 8px', fontSize:10, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i>1?'right':'left' }}>{h}</div>
                ))}
              </div>
              {form.lines.map((l,i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'36px 1fr 100px 100px 28px', borderBottom:i<form.lines.length-1?'0.5px solid var(--bd)':'none', background:lineErrs[i]?'rgba(163,45,45,0.04)':i%2===0?'#FDFAF6':'var(--sand)' }}>
                  <div style={{ padding:'6px 8px', fontSize:11, color:'var(--stone)', display:'flex', alignItems:'center' }}>{i+1}</div>
                  <div style={{ padding:'4px 6px' }}>
                    <input list={`acct-list-${i}`} value={l.ac} onChange={e=>updLine(i,'ac',e.target.value)} placeholder="Account name"
                      style={{ width:'100%', padding:'4px 6px', fontSize:12, border:lineErrs[i]?'0.5px solid var(--rd)':'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }} />
                    <datalist id={`acct-list-${i}`}>
                      {(cats||[]).filter(x=>x.is_active!==false).sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999)).map(a=>(
                        <option key={a.id} value={a.code?`${a.code} · ${a.l}`:a.l}/>
                      ))}
                    </datalist>
                  </div>
                  {['dr','cr'].map(field=>(
                    <div key={field} style={{ padding:'4px 6px' }}>
                      <input type="number" step="0.01" min="0" value={l[field]} onChange={e=>updLine(i,field,e.target.value)} placeholder="0.00"
                        style={{ width:'100%', padding:'4px 6px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', textAlign:'right', fontFamily:'var(--font-sans)', fontVariantNumeric:'tabular-nums' }} />
                    </div>
                  ))}
                  <div style={{ padding:'4px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <button onClick={()=>delLine(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:15, padding:0, opacity:form.lines.length===1?0.3:1 }} disabled={form.lines.length===1}>×</button>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-sm" onClick={addLine} style={{ marginBottom:12 }}>+ Add line</button>

            {/* Balance check */}
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--sand)', borderRadius:'var(--rr)', marginBottom:12 }}>
              <span style={{ fontSize:12 }}>DR: <strong style={{ fontVariantNumeric:'tabular-nums' }}>{fmt(totalDr)}</strong></span>
              <span style={{ fontSize:12 }}>CR: <strong style={{ fontVariantNumeric:'tabular-nums' }}>{fmt(totalCr)}</strong></span>
              <span style={{ fontSize:12, marginLeft:'auto', padding:'2px 10px', borderRadius:99, fontWeight:600,
                background:balanced?'var(--gnb)':'var(--rdb)', color:balanced?'var(--gn)':'var(--rd)' }}>
                {balanced ? '✓ Balanced' : `Off by ${fmt(Math.abs(totalDr-totalCr))}`}
              </span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-a" onClick={postEntry} disabled={saving || !balanced}>{saving?'Saving…':editing?'Update entry':'Post entry'}</button>
              <button className="btn" onClick={()=>{ setForm(newForm()); setEditing(null); setShowForm(false); setNotice(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── General Ledger tab ── */}
      {tab === 'ledger' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div className="ch">
            <h3>General Ledger</h3>
            <p>Consolidated account balances across all journal entries</p>
          </div>
          <GeneralLedger journals={activeJournals} catMap={catMap} txns={txns} />
        </div>
      )}

      {/* ── Journal Entries tab ── */}
      {tab === 'entries' && (
        <div>
          {/* Manual + auto journal entries */}
          <div className="card" style={{ marginBottom:12 }}>
            <div className="ch">
              <h3>Journal entries</h3>
              <p>{activeJournals.filter(j=>j.source!=='reversal').length} active · {journals.filter(j=>j.status==='void').length} voided</p>
            </div>
            {activeJournals.filter(j=>j.source!=='reversal').length === 0 ? (
              <div style={{ padding:'20px 14px', fontSize:12, color:'var(--stone)' }}>No entries posted yet.</div>
            ) : (
              <JournalList journals={activeJournals.filter(j=>j.source!=='reversal')} onEdit={loadForEdit} onVoid={voidJournal} catMap={catMap} />
            )}
          </div>
          {/* Reversal entries */}
          {reversalJournals.length > 0 && (
            <div className="card">
              <div className="ch" style={{ background:'var(--rdb)' }}>
                <h3 style={{ color:'var(--rd)' }}>↩ Reversals</h3>
                <p style={{ color:'var(--rd)', opacity:0.8 }}>{reversalJournals.length} reversal{reversalJournals.length!==1?'s':''} — created when accounts were deactivated or transactions unallocated</p>
              </div>
              <JournalList journals={reversalJournals} onEdit={()=>{}} onVoid={voidJournal} onUnvoid={unvoidJournal} catMap={catMap} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
