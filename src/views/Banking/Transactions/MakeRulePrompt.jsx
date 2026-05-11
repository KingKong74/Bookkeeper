/**
 * views/Banking/Transactions/MakeRulePrompt.jsx
 * Prompt suggesting a rule after repeated manual categorisation.
 */
import React from 'react';

export function MakeRulePrompt({ desc, catLabel, onAccept, onDismiss, onNeverShow }) {
  return (
    <div style={{ position:'fixed', bottom:24, right:24, background:'#FDFAF6', border:'0.5px solid var(--bd2)', borderRadius:10, padding:'12px 16px', zIndex:700, boxShadow:'0 6px 24px rgba(42,36,32,0.15)', maxWidth:320, fontSize:12 }}>
      <div style={{ fontWeight:500, marginBottom:4, fontSize:12.5 }}>💡 Make this a rule?</div>
      <div style={{ color:'var(--stone)', marginBottom:10, lineHeight:1.5 }}>
        Always categorise <strong>"{desc?.slice(0,25)}{desc?.length>25?'…':''}"</strong> as <strong>{catLabel}</strong>?
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <button className="btn btn-a btn-sm" onClick={onAccept}>Create rule</button>
        <button className="btn btn-sm" onClick={onDismiss}>Not now</button>
        <button onClick={onNeverShow} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--stone)', fontSize:11, textDecoration:'underline', padding:'4px 2px' }}>Don't show again</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// ── Suppression store ─────────────────────────────────────────────────────────
