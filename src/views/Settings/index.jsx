/**
 * views/Settings/index.jsx — App-wide settings page
 */
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { updateOrgSetting, upsertMerchantHint, disableMerchantHint } from '../../lib/supabase';
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
    <div onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:11, cursor:'pointer', transition:'background 0.2s', background:value?'var(--a)':'var(--sand3)', position:'relative' }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left:value?20:2, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

export function Settings() {
  const { org, user, reloadAll, toast, txns, accounts, cats, orgSettings, setOrgSettings, merchantHints, setMerchantHints } = useApp();
  const [showHints,    setShowHints]    = useState(false);
  const [hintSearch,   setHintSearch]   = useState('');
  const [editingHint,  setEditingHint]  = useState(null);
  const [savingHint,   setSavingHint]   = useState(false);
  const [showCents,    setShowCents]    = useState(() => localStorage.getItem('pref_show_cents')   !== 'false');
  const [compactRows,  setCompactRows]  = useState(() => localStorage.getItem('pref_compact_rows') === 'true');
  const [currency,     setCurrency]     = useState(() => localStorage.getItem('pref_currency')     || 'AUD');
  const [dateFormat,   setDateFormat]   = useState(() => localStorage.getItem('pref_date_format')  || 'dd/mm/yyyy');
  const [fyCutoff,     setFyCutoff]     = useState(() => localStorage.getItem('pref_fy_cutoff')    || 'july');
  const [darkMode,     setDarkMode]     = useState(() => localStorage.getItem('pref_dark_mode') === 'true');

  // Apply dark mode on mount and when toggled
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

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
        <Row label="Dark mode" sub="Switch to dark colour scheme">
          <Toggle value={darkMode} onChange={v => {
            setDarkMode(v);
            savePref('dark_mode', v);
            // Fire event so Sidebar can animate the logo flip
            window.dispatchEvent(new CustomEvent('ledger:theme-toggle', { detail: { dark: v } }));
          }} />
        </Row>
        <Row label="Show cents" sub="Display decimal places on whole dollar amounts"><Toggle value={showCents} onChange={v=>toggle('show_cents',setShowCents,v)} /></Row>
        <Row label="Compact rows" sub="Reduce row height in transaction table"><Toggle value={compactRows} onChange={v=>toggle('compact_rows',setCompactRows,v)} /></Row>
        <Row label="Currency">
          <select value={currency} onChange={e=>{setCurrency(e.target.value);savePref('currency',e.target.value);}} style={{ padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', fontFamily:'var(--font-sans)' }}>
            {['AUD','USD','GBP','EUR','NZD'].map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </Row>
        <Row label="Date display format">
          <select value={dateFormat} onChange={e=>{setDateFormat(e.target.value);savePref('date_format',e.target.value);}} style={{ padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', fontFamily:'var(--font-sans)' }}>
            <option value="dd/mm/yyyy">DD/MM/YYYY</option>
            <option value="mm/dd/yyyy">MM/DD/YYYY</option>
            <option value="yyyy-mm-dd">YYYY-MM-DD (ISO)</option>
          </select>
        </Row>
        <Row label="Financial year start">
          <select value={fyCutoff} onChange={e=>{setFyCutoff(e.target.value);savePref('fy_cutoff',e.target.value);}} style={{ padding:'4px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', fontFamily:'var(--font-sans)' }}>
            <option value="july">1 July — Australian FY</option>
            <option value="january">1 January — Calendar year</option>
            <option value="april">1 April — UK FY</option>
          </select>
        </Row>
      </Section>

      <Section title="Intelligence">
        <Row label="Merchant intelligence"
          sub="Suggest categories based on merchant name (Woolworths → Groceries, Netflix → Subscriptions). Suggestions are hints only — never applied without your approval.">
          <Toggle
            value={orgSettings?.merchantIntelEnabled !== false}
            onChange={async v => {
              try {
                await updateOrgSetting(org.id, 'merchantIntelEnabled', v);
                setOrgSettings(prev => ({ ...prev, merchantIntelEnabled: v }));
                toast(`Merchant intelligence ${v ? 'enabled' : 'disabled'}.`);
              } catch(e) { toast('Error: ' + e.message); }
            }} />
        </Row>
        <Row label="Merchant hints"
          sub={`${(merchantHints||[]).filter(h=>h.org_id).length} custom · ${(merchantHints||[]).filter(h=>!h.org_id).length} built-in`}>
          <button className="btn btn-sm" onClick={() => setShowHints(v=>!v)}>{showHints ? 'Hide' : 'Manage hints'}</button>
        </Row>
        {showHints && (
          <div style={{ padding:'0 16px 16px' }}>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input placeholder="Search hints…" value={hintSearch} onChange={e=>setHintSearch(e.target.value)}
                style={{ flex:1, padding:'5px 10px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', fontFamily:'var(--font-sans)' }} />
              <button className="btn btn-a btn-sm" onClick={()=>setEditingHint({keyword:'',hint:'',cat_type:'expense',isNew:true})}>+ Add hint</button>
            </div>
            {editingHint && (
              <div style={{ marginBottom:10, padding:12, background:'var(--sand)', borderRadius:'var(--rr)', border:'0.5px solid var(--bd)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, alignItems:'end' }}>
                  {[['Merchant keyword','keyword','e.g. bunnings'],['Category hint','hint','e.g. home improvement']].map(([lbl,field,ph])=>(
                    <div key={field}>
                      <div style={{ fontSize:10, fontWeight:500, color:'var(--stone)', marginBottom:3, textTransform:'uppercase' }}>{lbl}</div>
                      <input value={editingHint[field]} onChange={e=>setEditingHint(h=>({...h,[field]:e.target.value}))}
                        placeholder={ph} style={{ width:'100%', boxSizing:'border-box', padding:'5px 8px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', fontFamily:'var(--font-sans)' }} />
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:5, alignItems:'flex-end' }}>
                    <select value={editingHint.cat_type} onChange={e=>setEditingHint(h=>({...h,cat_type:e.target.value}))}
                      style={{ padding:'5px 8px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--bg-card)', fontFamily:'var(--font-sans)' }}>
                      {['expense','income','asset','liability','equity'].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="btn btn-a btn-sm" disabled={savingHint||!editingHint.keyword.trim()||!editingHint.hint.trim()}
                      onClick={async()=>{
                        setSavingHint(true);
                        try {
                          const h = await upsertMerchantHint(org.id, editingHint.keyword, editingHint.hint, editingHint.cat_type);
                          setMerchantHints(prev=>[...prev.filter(x=>!(x.org_id===org.id&&x.keyword===h.keyword)),h]);
                          setEditingHint(null); toast('Hint saved.');
                        } catch(e) { toast('Error: '+e.message); }
                        finally { setSavingHint(false); }
                      }}>{savingHint?'Saving…':'Save'}</button>
                    <button className="btn btn-sm" onClick={()=>setEditingHint(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            <div style={{ border:'0.5px solid var(--bd)', borderRadius:'var(--rr)', overflow:'hidden', maxHeight:300, overflowY:'auto' }}>
              {(merchantHints||[])
                .filter(h => !hintSearch || h.keyword.includes(hintSearch.toLowerCase()) || h.hint.includes(hintSearch.toLowerCase()))
                .sort((a,b) => a.keyword.localeCompare(b.keyword))
                .map(h => (
                  <div key={h.id} style={{ display:'flex', alignItems:'center', padding:'6px 12px', borderBottom:'0.5px solid var(--bd)', background:h.org_id?'rgba(186,117,23,0.04)':'var(--bg-card)', fontSize:12 }}>
                    <span style={{ flex:'0 0 150px', fontWeight:500 }}>{h.keyword}</span>
                    <span style={{ flex:1, color:'var(--stone)' }}>{h.hint}</span>
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, marginRight:8, background:h.org_id?'var(--al)':'var(--sand2)', color:h.org_id?'var(--a2)':'var(--stone)' }}>{h.org_id?'custom':'built-in'}</span>
                    <span style={{ fontSize:10, color:'var(--stone)', marginRight:8, minWidth:55 }}>{h.cat_type}</span>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-sm" style={{ fontSize:10 }} onClick={()=>setEditingHint({...h,isNew:false})}>Edit</button>
                      {h.org_id && <button className="btn btn-sm" style={{ fontSize:10, color:'var(--rd)' }}
                        onClick={async()=>{ await disableMerchantHint(h.id); setMerchantHints(p=>p.filter(x=>x.id!==h.id)); toast('Hint removed.'); }}>
                        Remove
                      </button>}
                    </div>
                  </div>
                ))}
            </div>
            <div style={{ fontSize:11, color:'var(--stone)', marginTop:6 }}>Custom hints override built-in ones with the same keyword.</div>
          </div>
        )}
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
