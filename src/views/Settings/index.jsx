/**
 * views/Settings/index.jsx
 * App-wide settings page
 */
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { clearSessionPref } from '../../hooks/useSessionPref';

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div className="ch"><h3>{title}</h3></div>
      <div style={{ padding:'4px 0' }}>{children}</div>
    </div>
  );
}
function Row({ label, sub, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', borderBottom:'0.5px solid var(--bd)' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13 }}>{label}</div>
        {sub && <div style={{ fontSize:11.5, color:'var(--stone)', marginTop:2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink:0, marginLeft:16 }}>{children}</div>
    </div>
  );
}
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:11, cursor:'pointer', transition:'background 0.2s', background:value?'#BA7517':'var(--sand3)', position:'relative' }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left:value?20:2, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

export function Settings() {
  const { org, user, reloadAll, toast, txns, accounts, cats } = useApp();
  const [showCents,   setShowCents]   = useState(() => localStorage.getItem('pref_show_cents')   !== 'false');
  const [compactRows, setCompactRows] = useState(() => localStorage.getItem('pref_compact_rows') === 'true');
  const [currency,    setCurrency]    = useState(() => localStorage.getItem('pref_currency')     || 'AUD');
  const [dateFormat,  setDateFormat]  = useState(() => localStorage.getItem('pref_date_format')  || 'dd/mm/yyyy');
  const [fyCutoff,    setFyCutoff]    = useState(() => localStorage.getItem('pref_fy_cutoff')    || 'july');

  function savePref(k, v) { localStorage.setItem(`pref_${k}`, v); }
  function toggle(k, setter, v) { setter(v); savePref(k, v); }

  async function exportCSV() {
    const rows = (txns||[]).map(t => [t.date, `"${(t.desc||'').replace(/"/g,'""')}"`, t.amt, t.payee||'', t.account_id||'unlinked', t.note||'']);
    const csv = [['Date','Description','Amount','Payee','AccountID','Note'],...rows].map(r=>r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download:`ledger-${new Date().toISOString().slice(0,10)}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
    toast(`Exported ${rows.length} transactions.`);
  }

  return (
    <div style={{ maxWidth:680 }}>
      <Section title="Organisation">
        <Row label="Organisation" sub={org?.name || '—'}><span style={{ fontSize:12, color:'var(--stone)', textTransform:'capitalize' }}>{org?.type||'personal'}</span></Row>
        <Row label="Signed in as" sub={user?.email}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', fontWeight:500 }}>Active</span></Row>
        <Row label="Data region"><span style={{ fontSize:12, color:'var(--stone)' }}>ap-southeast-2 (Sydney)</span></Row>
      </Section>

      <Section title="Display">
        <Row label="Show cents" sub="Display decimal places on whole dollar amounts"><Toggle value={showCents} onChange={v=>toggle('show_cents',setShowCents,v)} /></Row>
        <Row label="Compact rows" sub="Reduce row height in transaction table"><Toggle value={compactRows} onChange={v=>toggle('compact_rows',setCompactRows,v)} /></Row>
        <Row label="Currency">
          <select value={currency} onChange={e=>{setCurrency(e.target.value);savePref('currency',e.target.value);}} style={{ padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }}>
            {['AUD','USD','GBP','EUR','NZD'].map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </Row>
        <Row label="Date display format">
          <select value={dateFormat} onChange={e=>{setDateFormat(e.target.value);savePref('date_format',e.target.value);}} style={{ padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }}>
            <option value="dd/mm/yyyy">DD/MM/YYYY</option>
            <option value="mm/dd/yyyy">MM/DD/YYYY</option>
            <option value="yyyy-mm-dd">YYYY-MM-DD (ISO)</option>
          </select>
        </Row>
        <Row label="Financial year start">
          <select value={fyCutoff} onChange={e=>{setFyCutoff(e.target.value);savePref('fy_cutoff',e.target.value);}} style={{ padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'#FDFAF6', fontFamily:'var(--font-sans)' }}>
            <option value="july">1 July — Australian FY</option>
            <option value="january">1 January — Calendar year</option>
            <option value="april">1 April — UK FY</option>
          </select>
        </Row>
      </Section>

      <Section title="Prompts">
        <Row label="Auto-cat rule suggestions" sub='"Make this a rule?" prompt after repeated category allocations'>
          <button className="btn btn-sm" onClick={()=>{clearSessionPref('suppress_rule_prompt');toast('Rule prompt re-enabled.');}}>Re-enable</button>
        </Row>
      </Section>

      <Section title="Data">
        <Row label="Transactions" sub={`${(txns||[]).length} total · ${(txns||[]).filter(t=>!t.cat).length} unallocated · ${(txns||[]).filter(t=>!t.account_id).length} unlinked`}>
          <button className="btn btn-sm" onClick={async()=>{await reloadAll();toast('Data reloaded.');}}>↺ Reload</button>
        </Row>
        <Row label="Bank accounts" sub={`${(accounts||[]).length} configured`}>
          <span style={{ fontSize:12, color:'var(--stone)' }}>{(accounts||[]).map(a=>a.name).join(' · ')||'None'}</span>
        </Row>
        <Row label="Export all transactions" sub="Download as CSV">
          <button className="btn btn-sm" onClick={exportCSV}>↓ Export CSV</button>
        </Row>
        <Row label="Clear saved preferences" sub="Reset display settings and dismissed prompts">
          <button className="btn btn-sm" onClick={()=>{['show_cents','compact_rows','currency','date_format','fy_cutoff','suppress_rule_prompt'].forEach(k=>localStorage.removeItem(`pref_${k}`));toast('Preferences cleared.');}}>Clear</button>
        </Row>
      </Section>

      <Section title="About">
        <Row label="Ledger" sub="Personal accounting, done properly."><span style={{ fontSize:12, color:'var(--stone)' }}>v1.0</span></Row>
        <Row label="Database" sub="Supabase — your data, your project"><span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', fontWeight:500 }}>Connected</span></Row>
      </Section>
    </div>
  );
}
