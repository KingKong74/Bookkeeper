/**
 * views/Banking/Transactions/InlineCatPicker.jsx
 * Always-visible inline category picker with keyboard navigation and create-on-the-fly.
 */
import React, { useState, useEffect, useRef } from 'react';

const CAT_TYPE_ORDER  = ['income','expense','asset','liability','equity'];
const CAT_TYPE_LABELS = { income:'Income', expense:'Expenses', asset:'Assets', liability:'Liabilities', equity:'Equity' };

export function InlineCatPicker({ txnId, currentCatId, cats, catMap, onSelect, onCreateCat, suggestionCatId, suggestionLabel }) {
  const [q,    setQ]    = useState('');
  const [open, setOpen] = useState(false);
  const [hi,   setHi]   = useState(0);
  const inputRef        = useRef(null);
  const containerRef    = useRef(null);

  // Selectable = active accounts that are NOT parents-with-active-children
  const selectable = (cats||[]).filter(c => {
    if (c.is_active === false) return false;
    const hasSubs = cats.some(ch=>ch.parent_id===c.id&&ch.is_active!==false);
    return !hasSubs;
  });
  const flat = q.trim()
    ? selectable.filter(c => {
        const lq = q.toLowerCase();
        return (c.l||'').toLowerCase().includes(lq) || (c.code||'').includes(lq);
      })
    : selectable;

  useEffect(() => setHi(0), [q]);

  useEffect(() => {
    function down(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  function pick(catId) {
    onSelect(txnId, catId);
    setQ('');
    setOpen(false);
  }

  function handleKey(e) {
    if (!open) { if (e.key !== 'Escape') setOpen(true); return; }
    if (e.key === 'Escape')   { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i+1, flat.length-1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i-1, 0)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (flat[hi]) { pick(flat[hi].id); return; }
      const trimQ = q.trim();
      // Code pattern: "831" or "831/002" — create with pre-filled code
      if (/^\d{1,3}(\/\d{1,3})?$/.test(trimQ) && onCreateCat) {
        onCreateCat('__code__:' + trimQ).then(cat => { if (cat) pick(cat.id); });
        return;
      }
      if (flat.length === 0 && trimQ.length > 1 && onCreateCat) {
        onCreateCat(trimQ).then(cat => { if (cat) pick(cat.id); });
      }
    }
  }

  const current    = currentCatId    ? catMap[currentCatId]    : null;
  const suggestion = suggestionCatId ? catMap[suggestionCatId] : null;
  // What to display when closed: real cat > suggestion hint > empty
  const displayCat = current || (suggestion && !open ? suggestion : null);
  const isSuggestion = !current && !!suggestion && !open;

  // Group for display — with parent headers and numeric code sort
  function buildSectionItems(items) {
    const withParent = items.filter(c=>c.parent_id);
    const standalone = items.filter(c=>!c.parent_id);
    const byParent = {};
    withParent.forEach(c=>{if(!byParent[c.parent_id])byParent[c.parent_id]=[];byParent[c.parent_id].push(c);});
    const result = [];
    Object.keys(byParent).forEach(pid => {
      const parent = cats.find(x=>x.id===pid);
      if (parent) result.push({c:parent, isHeader:true, indent:false});
      byParent[pid].sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999))
        .forEach(ch=>result.push({c:ch, isHeader:false, indent:true}));
    });
    standalone.sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999))
      .forEach(c=>result.push({c, isHeader:false, indent:false}));
    return result;
  }
  const groups = {};
  CAT_TYPE_ORDER.forEach(t => { groups[t] = []; });
  flat.forEach(c => { if (groups[c.t]) groups[c.t].push(c); });
  const sections = q.trim()
    ? [{ label:'', items: flat.map(c=>({c, isHeader:false, indent:!!c.parent_id})) }]
    : CAT_TYPE_ORDER.filter(t=>groups[t].length>0).map(t=>({
        label: CAT_TYPE_LABELS[t],
        items: buildSectionItems(groups[t]),
      }));

  let globalIdx = 0;

  return (
    <div ref={containerRef} style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
      {/* Always-visible input */}
      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
        {(current || (suggestion && !open)) && (
          <span style={{ width:7, height:7, borderRadius:'50%', background:(current||suggestion)?.col, flexShrink:0, display:'inline-block', opacity: isSuggestion ? 0.55 : 1 }} />
        )}
        <input
          ref={inputRef}
          value={open ? q : (current?.l || suggestion?.l || '')}
          placeholder="Account…"
          onFocus={() => { setOpen(true); setQ(''); }}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={handleKey}
          style={{
            width:'100%', minWidth:0, padding:'2px 6px', fontSize:11.5,
            border:'0.5px solid transparent', borderRadius:'var(--rr)',
            background: '#FDFAF6',
            color: current ? 'var(--ink)' : suggestion && !open ? suggestion.col : 'var(--stone)',
            fontStyle: isSuggestion ? 'italic' : 'normal',
            fontFamily:'var(--font-sans)', cursor:'text',
            outline:'none',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor='var(--bd2)'; }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor='transparent'; }}
        />
        {current && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(txnId, null); }}
            title="Remove account"
            className="inline-clear-btn"
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:12, padding:'0 2px', lineHeight:1, flexShrink:0, opacity:0 }}
          >×</button>
        )}
        {isSuggestion && !open && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(txnId, suggestionCatId); }}
            title={`Apply ${suggestionLabel || 'suggestion'}: ${suggestion?.l}`}
            style={{ background:'var(--gnb)', border:'0.5px solid rgba(59,109,17,0.35)', borderRadius:3, cursor:'pointer', color:'var(--gn)', fontSize:10, padding:'1px 5px', lineHeight:1.4, flexShrink:0, fontWeight:600 }}
          >✓</button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:'fixed',
          left: containerRef.current ? Math.min(containerRef.current.getBoundingClientRect().left, window.innerWidth - 230) : 0,
          top:  containerRef.current ? containerRef.current.getBoundingClientRect().bottom + 2 : 0,
          zIndex:700, background:'#FDFAF6', border:'0.5px solid var(--bd2)',
          borderRadius:'var(--rl)', minWidth:220, maxHeight:280, overflowY:'auto',
          boxShadow:'0 6px 20px rgba(42,36,32,0.14)',
        }}>
          <div style={{ position:'sticky', top:0, background:'#FDFAF6', borderBottom:'0.5px solid var(--bd)', zIndex:1 }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
              placeholder="Search categories…"
              style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', fontSize:12.5, border:'none', background:'#FDFAF6', outline:'none', fontFamily:'var(--font-sans)' }} />
          </div>
          {current && (
            <div style={{ padding:'5px 10px', fontSize:11.5, color:'var(--stone)', borderBottom:'0.5px solid var(--bd)', cursor:'pointer' }}
              onMouseDown={() => { onSelect(txnId, null); setOpen(false); }}>
              <span style={{ fontSize:11, marginRight:6 }}>✕</span>Remove account
            </div>
          )}
          {sections.map(({ label, items }) => (
            <React.Fragment key={label}>
              {label && <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--sand)', borderTop:'0.5px solid var(--bd)' }}>{label}</div>}
              {items.map(({c, isHeader, indent}) => {
                if (isHeader) return (
                  <div key={'h:'+c.id} style={{ padding:'4px 10px', fontSize:11, display:'flex', alignItems:'center', gap:6, background:'var(--sand)', color:'var(--stone)', borderTop:'0.5px solid var(--bd)', cursor:'default' }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:c.col, flexShrink:0 }} />
                    {c.code && <span style={{ fontFamily:'monospace', fontSize:10, color:'var(--stone2)' }}>{c.code}</span>}
                    <span style={{ fontWeight:500 }}>{c.l}</span>
                  </div>
                );
                const idx = globalIdx++;
                return (
                  <div key={c.id}
                    style={{ padding:'6px 10px 6px '+(indent?'22px':'10px'), fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:7, background:idx===hi?'var(--al)':'', fontWeight:c.id===currentCatId?500:400 }}
                    onMouseEnter={() => setHi(idx)}
                    onMouseDown={() => pick(c.id)}
                  >
                    {indent && <span style={{ fontSize:9, color:'var(--stone2)' }}>└</span>}
                    <span style={{ width:7, height:7, borderRadius:'50%', background:c.col, flexShrink:0 }} />
                    {c.code && <span style={{ fontFamily:'monospace', fontSize:10, color:'var(--stone2)', flexShrink:0 }}>
                      {indent && c.code.includes('/') ? '/' + c.code.split('/')[1] : c.code}
                    </span>}
                    <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.l}</span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
          {q.trim().length > 0 && (
            <div
              style={{ padding:'8px 10px', fontSize:12, cursor:'pointer', color:'var(--a2)', fontWeight:500, display:'flex', alignItems:'center', gap:6 }}
              onMouseDown={async () => {
                if (!onCreateCat) return;
                const trimQ = q.trim();
                const isCode = /^\d{1,3}(\/\d{1,3})?$/.test(trimQ);
                const signal = isCode ? '__code__:' + trimQ : trimQ;
                const cat = await onCreateCat(signal);
                if (cat) pick(cat.id);
              }}
            >
              <span style={{ fontSize:13 }}>+</span>
              {/^\d{1,3}(\/\d{1,3})?$/.test(q.trim())
                ? <span>Create account with code <strong style={{ fontFamily:'monospace' }}>{q.trim()}</strong></span>
                : <span>Create account &ldquo;{q.trim()}&rdquo;</span>
              }
            </div>
          )}
          {flat.length === 0 && !q.trim() && <div style={{ padding:'10px', fontSize:12, color:'var(--stone)', textAlign:'center' }}>No matches</div>}
          <div style={{ padding:'3px 10px', fontSize:10, color:'var(--sand4)', borderTop:'0.5px solid var(--bd)' }}>↑↓ · Enter/Tab · Esc</div>
        </div>
      )}
    </div>
  );
}

// ── Inline payee picker ───────────────────────────────────────────────────────
