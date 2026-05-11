/**
 * views/Banking/Transactions/DeleteToast.jsx
 * Bottom-of-screen confirmation toast for delete actions.
 */
import React from 'react';

export function DeleteToast({ txn, onConfirm, onCancel }) {
  if (!txn) return null;
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#2A2420', color:'#F5F1EB', borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:14, zIndex:700, boxShadow:'0 6px 24px rgba(0,0,0,0.25)', fontSize:13, minWidth:320 }}>
      <span style={{ flex:1 }}>Delete <strong>"{txn.desc?.slice(0,30)}{txn.desc?.length>30?'…':''}"</strong>?</span>
      <button onClick={onCancel} style={{ background:'rgba(255,255,255,0.12)', border:'none', color:'#F5F1EB', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12 }}>Cancel</button>
      <button onClick={onConfirm} style={{ background:'#A32D2D', border:'none', color:'#fff', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:500 }}>Delete</button>
    </div>
  );
}

// ── Make-a-rule prompt ────────────────────────────────────────────────────────
