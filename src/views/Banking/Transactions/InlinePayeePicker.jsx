/**
 * views/Banking/Transactions/InlinePayeePicker.jsx
 * Inline payee picker with autocomplete and create-on-the-fly.
 */
import React, { useState, useEffect, useRef } from 'react';
import { PayeeAvatar } from '../../../components/ui/index';
import { upsertPayee } from '../../../services/categoryService';

export function InlinePayeePicker({ txnId, currentPayee, payees, setPayees, onSelect, org, PALETTE }) {
  const [q,    setQ]    = useState('');
  const [open, setOpen] = useState(false);
  const [hi,   setHi]   = useState(0);
  const containerRef    = useRef(null);

  const filtered  = (payees||[]).filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.trim().length > 1 && !(payees||[]).find(p => p.name.toLowerCase() === q.trim().toLowerCase());
  const allItems  = canCreate ? [...filtered, { _create:true, name:q.trim() }] : filtered;

  useEffect(() => setHi(0), [q]);

  useEffect(() => {
    function down(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  async function createAndSelect(name) {
    const col  = (PALETTE||[])[payees.length % (PALETTE||['#888']).length] || '#888';
    const newP = await upsertPayee(org.id, name.trim(), col);
    setPayees(prev => prev.find(p => p.id === newP.id) ? prev : [...prev, newP]);
    onSelect(txnId, newP);
    setOpen(false); setQ('');
  }

  function pickItem(item) {
    if (item._create) createAndSelect(item.name);
    else { onSelect(txnId, item); setOpen(false); setQ(''); }
  }

  function handleKey(e) {
    if (!open) { if (e.key !== 'Escape') setOpen(true); return; }
    if (e.key === 'Escape')    { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i+1, allItems.length-1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i-1, 0)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (allItems[hi]) pickItem(allItems[hi]);
      else if (canCreate) createAndSelect(q.trim());
    }
  }

  return (
    <div ref={containerRef} style={{ position:'relative', minWidth:0, overflow:'hidden' }} onClick={e => e.stopPropagation()}>
      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
        {currentPayee && !open && (
          <PayeeAvatar name={currentPayee} payeesList={payees||[]} size="sm" />
        )}
        <input
          value={open ? q : (currentPayee || '')}
          placeholder="Payee…"
          onFocus={() => { setOpen(true); setQ(currentPayee || ''); }}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={handleKey}
          style={{
            width:'100%', minWidth:0, padding:'2px 6px', fontSize:11.5,
            border:'0.5px solid transparent', borderRadius:'var(--rr)',
            background: 'var(--bg-card)',
            color: currentPayee ? 'var(--ink)' : 'var(--stone)',
            fontFamily:'var(--font-sans)', cursor:'text', outline:'none',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor='var(--bd2)'; }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor='transparent'; }}
        />
        {currentPayee && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(txnId, null); }}
            title="Remove payee"
            className="inline-clear-btn"
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:12, padding:'0 2px', lineHeight:1, flexShrink:0, opacity:0 }}
          >×</button>
        )}
      </div>

      {open && (
        <div style={{
          position:'fixed',
          left: containerRef.current ? Math.min(containerRef.current.getBoundingClientRect().left, window.innerWidth - 230) : 0,
          top:  containerRef.current ? containerRef.current.getBoundingClientRect().bottom + 2 : 0,
          zIndex:700, background:'var(--bg-card)', border:'0.5px solid var(--bd2)',
          borderRadius:'var(--rl)', minWidth:220, maxHeight:260, overflowY:'auto',
          boxShadow:'0 6px 20px rgba(42,36,32,0.14)',
        }}>
          <div style={{ position:'sticky', top:0, background:'var(--bg-card)', borderBottom:'0.5px solid var(--bd)', zIndex:1 }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
              placeholder="Search or create…"
              style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', fontSize:12.5, border:'none', background:'var(--bg-card)', outline:'none', fontFamily:'var(--font-sans)' }} />
          </div>
          {currentPayee && (
            <div style={{ padding:'5px 10px', fontSize:11.5, color:'var(--stone)', borderBottom:'0.5px solid var(--bd)', cursor:'pointer' }}
              onMouseDown={() => { onSelect(txnId, null); setOpen(false); }}>
              <span style={{ fontSize:11, marginRight:6 }}>✕</span>Remove payee
            </div>
          )}
          {filtered.map((p, i) => (
            <div key={p.id}
              style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8, background: i===hi ? 'var(--al)' : '' }}
              onMouseEnter={() => setHi(i)}
              onMouseDown={() => pickItem(p)}
            >
              <span style={{ width:20, height:20, borderRadius:'50%', background:`${p.colour||p.col||'#888'}22`, color:p.colour||p.col||'#888', fontSize:9, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:700 }}>
                {p.name.slice(0,2).toUpperCase()}
              </span>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
            </div>
          ))}
          {canCreate && (
            <div
              style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', color:'var(--a2)', fontWeight:500, borderTop:'0.5px solid var(--bd)', background: hi===filtered.length ? 'var(--al)' : '' }}
              onMouseEnter={() => setHi(filtered.length)}
              onMouseDown={() => createAndSelect(q.trim())}
            >
              <span style={{ marginRight:6 }}>+</span>Create "{q.trim()}"
            </div>
          )}
          {filtered.length === 0 && !canCreate && (
            <div style={{ padding:'10px', fontSize:12, color:'var(--stone)', textAlign:'center' }}>
              {payees.length === 0 ? 'Type a name to create' : 'No matches'}
            </div>
          )}
          <div style={{ padding:'3px 10px', fontSize:10, color:'var(--sand4)', borderTop:'0.5px solid var(--bd)' }}>↑↓ · Enter/Tab · Esc</div>
        </div>
      )}
    </div>
  );
}

// ── Inline description editor ─────────────────────────────────────────────────
