/**
 * views/Banking/Transactions/InlineDescEditor.jsx
 * Click-to-edit inline description field.
 */
import React, { useState } from 'react';

export function InlineDescEditor({ txnId, value, note, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

  function commit() {
    if (draft.trim() !== value) onSave(txnId, draft.trim() || value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        onClick={e => e.stopPropagation()}
        style={{ width:'100%', padding:'2px 4px', fontSize:12, border:'0.5px solid var(--a)', borderRadius:'var(--rr)', background:'#fff', fontFamily:'var(--font-sans)', outline:'none' }}
      />
    );
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, overflow:'hidden' }}
      onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true); }}>
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, cursor:'text' }}
        title="Click to edit">{value}</span>
      {note && <span style={{ color:'var(--a)', fontSize:11, flexShrink:0 }}>📝</span>}
    </div>
  );
}

// ── Delete toast ──────────────────────────────────────────────────────────────
