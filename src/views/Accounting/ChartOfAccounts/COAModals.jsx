/**
 * views/Accounting/ChartOfAccounts/COAModals.jsx
 * All four COA modals: Seed, MasterCOABrowser, Deactivate, HardDelete, EditAccount
 */
import React from 'react';
import { TYPE_ORDER, TYPE_LABELS, TYPE_COLOURS, COA_TEMPLATES } from './coaData';

export function SeedModal({ onClose, onSeed, saving }) {
  const [seedMode,     setSeedMode]     = React.useState(null);
  const [seedTemplate, setSeedTemplate] = React.useState(null);
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width:500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>Seed chart of accounts</h3><button className="btn-ghost" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <p style={{ fontSize:12.5, color:'var(--stone2)', marginBottom:14 }}>Load a standard set of accounts for your entity type.</p>
          <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>How to handle existing accounts</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
            {[['replace','Replace existing','Remove all current accounts first'],['add','Add additional','Keep existing, add new ones']].map(([mode,label,desc])=>(
              <div key={mode} onClick={()=>setSeedMode(mode)} style={{ padding:12, borderRadius:'var(--rr)', border:`1.5px solid ${seedMode===mode?'var(--a)':'var(--bd)'}`, background:seedMode===mode?'var(--ab)':'transparent', cursor:'pointer' }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{label}</div><div style={{ fontSize:11, color:'var(--stone)', marginTop:3 }}>{desc}</div>
              </div>
            ))}
          </div>
          {seedMode==='replace'&&<div style={{ padding:'8px 12px', background:'var(--rdb)', borderRadius:'var(--rr)', fontSize:11.5, color:'var(--rd)', marginBottom:14 }}>⚠ Existing accounts will be deactivated. Transactions will become unallocated.</div>}
          <div style={{ fontSize:11, fontWeight:500, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Template</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[['personal','👤 Personal / Household','Individuals & families',COA_TEMPLATES.personal.length],['company','🏢 Company / Business','Pty Ltd, sole trader',COA_TEMPLATES.company.length],['trust','⚖️ Trust','Family & unit trusts',COA_TEMPLATES.trust.length]].map(([id,label,desc,cnt])=>(
              <div key={id} onClick={()=>setSeedTemplate(id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderRadius:'var(--rr)', border:`1.5px solid ${seedTemplate===id?'var(--a)':'var(--bd)'}`, background:seedTemplate===id?'var(--ab)':'transparent', cursor:'pointer' }}>
                <div><div style={{ fontWeight:500, fontSize:13 }}>{label}</div><div style={{ fontSize:11, color:'var(--stone)', marginTop:2 }}>{desc}</div></div>
                <span style={{ fontSize:11, color:'var(--stone)', flexShrink:0 }}>{cnt} accounts</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-a" disabled={!seedMode||!seedTemplate||saving} onClick={()=>onSeed(seedMode,seedTemplate,COA_TEMPLATES)}>{saving?'Seeding…':'Seed accounts'}</button>
        </div>
      </div>
    </div>
  );
}

export function MasterCOABrowser({ masterCOA, cats, onClose, onImport, importing }) {
  const [masterSearch,   setMasterSearch]   = React.useState('');
  const [masterSel,      setMasterSel]      = React.useState(new Set());
  const [showNullMaster, setShowNullMaster] = React.useState(false);
  const TYPE_RANGES_MAP = { asset:[100,399], liability:[400,599], equity:[600,699], income:[700,799], expense:[800,998] };
  const existingCodes  = new Set((cats||[]).map(c=>c.code).filter(Boolean));
  const existingLabels = new Set((cats||[]).map(c=>(c.l||'').toLowerCase()));
  const masterFiltered = React.useMemo(()=>{
    const q=masterSearch.toLowerCase();
    return (masterCOA||[]).filter(m=>{
      if(!showNullMaster&&(!m.label||!m.type)) return false;
      if(!q) return true;
      if(!m.label) return m.code.includes(q);
      return m.code.includes(q)||m.label.toLowerCase().includes(q)||(m.group_name||'').toLowerCase().includes(q);
    }).map(m=>({...m,alreadyAdded:existingCodes.has(m.code)||(m.label&&existingLabels.has(m.label.toLowerCase()))}));
  },[masterCOA,masterSearch,showNullMaster,cats]);
  function toggleSel(id){setMasterSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});}
  return (
    <div className="modal-bg" onMouseDown={e=>{if(e.target===e.currentTarget){onClose();setMasterSel(new Set());}}}>
      <div className="modal" style={{ width:720, maxHeight:'90vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>Master Chart of Accounts</h3><button className="btn-ghost" onClick={onClose}>×</button></div>
        <div style={{ padding:'10px 20px', borderBottom:'0.5px solid var(--bd)', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <input value={masterSearch} onChange={e=>setMasterSearch(e.target.value)} placeholder="Search by code, name or group…" style={{ flex:1, padding:'5px 10px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', fontFamily:'var(--font-sans)' }} />
          <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--stone)', cursor:'pointer', flexShrink:0 }}><input type="checkbox" checked={showNullMaster} onChange={e=>setShowNullMaster(e.target.checked)} />Show null slots</label>
          <span style={{ fontSize:12, color:'var(--stone)', flexShrink:0 }}>{masterSel.size} selected</span>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {TYPE_ORDER.map(type=>{
            const [lo,hi]=TYPE_RANGES_MAP[type]||[0,999];
            const rows=masterFiltered.filter(m=>{const n=parseInt(m.code);return m.type===type||(!m.type&&n>=lo&&n<=hi);}).sort((a,b)=>parseInt(a.code)-parseInt(b.code));
            if(!rows.length) return null;
            return (<div key={type}>
              <div style={{ padding:'6px 20px 4px', background:'var(--sand2)', position:'sticky', top:0, display:'flex', alignItems:'center', gap:6, borderBottom:'0.5px solid var(--bd)' }}>
                <span style={{ width:8, height:8, borderRadius:2, background:TYPE_COLOURS[type] }}/><span style={{ fontSize:11, fontWeight:700, color:TYPE_COLOURS[type], textTransform:'uppercase', letterSpacing:'0.07em' }}>{TYPE_LABELS[type]}</span><span style={{ fontSize:10, color:'var(--stone)' }}>({rows.length})</span>
              </div>
              {rows.map(m=>{
                if(!m.label||!m.type) return (<div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 20px', borderBottom:'0.5px solid var(--bd)', opacity:0.5 }}><span style={{ fontFamily:'monospace', fontSize:12, fontWeight:600, flex:'0 0 48px', color:'var(--stone)' }}>{m.code}</span><span style={{ flex:1, fontSize:11, color:'var(--stone)', fontStyle:'italic' }}>empty slot</span></div>);
                return (<div key={m.id} onClick={()=>!m.alreadyAdded&&toggleSel(m.id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 20px', borderBottom:'0.5px solid var(--bd)', opacity:m.alreadyAdded?0.4:1, cursor:m.alreadyAdded?'default':'pointer', background:masterSel.has(m.id)?'var(--ab)':'transparent' }}>
                  <input type="checkbox" checked={masterSel.has(m.id)} readOnly style={{ flexShrink:0, pointerEvents:'none' }}/>
                  <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:600, flex:'0 0 48px', color:'var(--stone)' }}>{m.code}</span>
                  <div style={{ flex:1, minWidth:0 }}><div style={{ fontWeight:500, fontSize:12.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</div>{m.description&&<div style={{ fontSize:11, color:'var(--stone)', marginTop:1 }}>{m.description}</div>}</div>
                  <span style={{ fontSize:11, color:'var(--stone)', flex:'0 0 140px', textAlign:'right' }}>{m.group_name}</span>
                  {m.is_common&&<span style={{ fontSize:9, padding:'1px 5px', borderRadius:99, background:'var(--gnb)', color:'var(--gn)', fontWeight:600, marginLeft:4, flexShrink:0 }}>common</span>}
                  {m.alreadyAdded&&<span style={{ fontSize:9, color:'var(--stone)', marginLeft:4, flexShrink:0 }}>added</span>}
                </div>);
              })}
            </div>);
          })}
          {masterFiltered.length===0&&<div style={{ padding:32, textAlign:'center', color:'var(--stone)', fontSize:12 }}>No accounts match your search.</div>}
        </div>
        <div className="modal-foot" style={{ justifyContent:'space-between' }}>
          <button className="btn btn-sm" onClick={()=>{const e=new Set(masterFiltered.filter(m=>!m.alreadyAdded).map(m=>m.id));setMasterSel(p=>p.size===e.size?new Set():e);}}>{masterSel.size>0?'Deselect all':'Select all visible'}</button>
          <div style={{ display:'flex', gap:8 }}><button className="btn" onClick={()=>{onClose();setMasterSel(new Set());}}>Cancel</button><button className="btn btn-a" disabled={masterSel.size===0||importing} onClick={()=>onImport(masterSel,masterCOA||[])}>{importing?'Adding…':`Add ${masterSel.size} account${masterSel.size!==1?'s':''}`}</button></div>
        </div>
      </div>
    </div>
  );
}

export function DeactivateModal({ target, onClose, onConfirm, saving }) {
  if (!target) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width:420 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-head" style={{ background:'var(--al)', borderBottom:'0.5px solid var(--bd)' }}><h3 style={{ color:'var(--a2)' }}>Set account inactive</h3><button className="btn-ghost" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <p style={{ fontSize:13, marginBottom:12 }}>Set <strong>"{target.l}"</strong> to inactive?</p>
          {target.txnCount>0&&<div style={{ padding:'8px 12px', background:'var(--al)', borderRadius:'var(--rr)', fontSize:12, color:'var(--a2)', marginBottom:10 }}><strong>{target.txnCount} transaction{target.txnCount!==1?'s':''}</strong> will be unassigned.</div>}
          <p style={{ fontSize:12, color:'var(--stone)' }}>The account will be hidden. Reactivate with ↺ or delete permanently with 🗑.</p>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-a" disabled={saving} onClick={onConfirm}>{saving?'Saving…':'Set inactive'}</button></div>
      </div>
    </div>
  );
}

export function HardDeleteModal({ target, onClose, onConfirm }) {
  if (!target) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width:400 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-head" style={{ background:'var(--rdb)', borderBottom:'0.5px solid #f09595' }}><h3 style={{ color:'var(--rd)' }}>Delete account</h3><button className="btn-ghost" onClick={onClose}>×</button></div>
        <div className="modal-body"><p style={{ fontSize:13 }}>Permanently delete <strong>"{target.l}"</strong> ({target.code})?</p><p style={{ fontSize:12, color:'var(--stone)', marginTop:8 }}>This cannot be undone.</p></div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn" style={{ background:'var(--rd)', color:'#fff', borderColor:'var(--rd)' }} onClick={onConfirm}>Delete permanently</button></div>
      </div>
    </div>
  );
}

export function EditAccountModal({ editingId, form, setForm, cats, PALETTE, onClose, onSave, saving }) {
  if (editingId === null) return null;
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width:420 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>{editingId==='new'?'New account':'Edit account'}</h3><button className="btn-ghost" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:12, marginBottom:12 }}>
            <div className="field" style={{ marginBottom:0 }}>
              <label>Code</label>
              {form.parent_id?(
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ fontFamily:'monospace', fontSize:12.5, color:'var(--stone)', background:'var(--sand2)', padding:'5px 8px', borderRadius:'var(--rr)', border:'0.5px solid var(--bd2)', flexShrink:0, whiteSpace:'nowrap' }}>{(form.code||'').split('/')[0]||'???'}/</span>
                  <input type="text" value={(form.code||'').split('/')[1]||''} onChange={e=>{const p=(form.code||'').split('/')[0]||'';const s=e.target.value.replace(/[^0-9]/g,'').slice(0,3);f('code',s?p+'/'+s:p);}} placeholder="001" maxLength={3} style={{ fontFamily:'monospace', width:70 }}/>
                </div>
              ):(
                <input type="text" value={form.code||''} onChange={e=>f('code',e.target.value.replace(/[^0-9]/g,'').slice(0,3))} onBlur={()=>{const v=(form.code||'').replace(/[^0-9]/g,'').slice(0,3);if(v)f('code',v.padStart(3,'0'));}} placeholder="001" maxLength={3} style={{ fontFamily:'monospace', width:80 }}/>
              )}
            </div>
            <div className="field" style={{ marginBottom:0 }}><label>Account name</label><input type="text" value={form.label||''} onChange={e=>f('label',e.target.value)} placeholder="e.g. Motor Vehicle Expenses"/></div>
          </div>
          <div className="field">
            <label>Parent account <span style={{ fontWeight:400, color:'var(--stone)' }}>(optional)</span></label>
            <select value={form.parent_id||''} onChange={e=>{const pid=e.target.value||null;f('parent_id',pid);if(pid){const par=(cats||[]).find(p=>p.id===pid);if(par?.code){const cur=(form.code||'').replace(/.*\//,'');f('code',par.code+'/'+cur.padStart(3,'0'));}}else if((form.code||'').includes('/'))f('code',(form.code||'').split('/')[1]);}}>
              <option value="">— Top-level (no parent) —</option>
              {(cats||[]).filter(p=>p.id!==editingId&&!p.parent_id&&p.is_active!==false).sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999)).map(p=><option key={p.id} value={p.id}>{p.code?p.code+'  ':''}{p.l}</option>)}
            </select>
            {form.parent_id&&editingId!=='new'&&<div style={{ marginTop:4, fontSize:11, color:'var(--a2)', background:'var(--al)', padding:'4px 8px', borderRadius:'var(--rr)' }}>↪ Moving under new parent. Transactions stay assigned to this account.</div>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field"><label>Type</label>
              <select value={form.type||'expense'} onChange={e=>f('type',e.target.value)}>
                {TYPE_ORDER.map(t=><option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
              {editingId!=='new'&&form.type!==(cats||[]).find(c=>c.id===editingId)?.t&&<div style={{ marginTop:5, padding:'5px 8px', background:'var(--rdb)', borderRadius:'var(--rr)', fontSize:11, color:'var(--rd)', fontWeight:500 }}>⚠ Type change will affect reports and journals.</div>}
            </div>
            <div className="field"><label>Group</label><input type="text" value={form.account_group||''} onChange={e=>f('account_group',e.target.value)} placeholder={TYPE_LABELS[form.type||'expense']}/></div>
          </div>
          <div className="field"><label>Colour</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, paddingTop:4 }}>
              {(PALETTE||[]).map(col=>(<span key={col} onClick={()=>f('colour',col)} style={{ width:22, height:22, borderRadius:'50%', background:col, cursor:'pointer', border:form.colour===col?'2.5px solid var(--ink)':'2px solid transparent' }}/>))}
            </div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-a" onClick={onSave} disabled={saving}>{saving?'Saving…':'Save'}</button></div>
      </div>
    </div>
  );
}
