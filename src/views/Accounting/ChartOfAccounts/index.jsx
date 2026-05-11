/**
 * views/Accounting/ChartOfAccounts/index.jsx
 * Thin page orchestrator — UI state only, no business logic.
 */
import React, { useState } from 'react';
import { useCOA }    from './useCOA';
import { COADrillPanel } from './COADrillPanel';
import { BankAccountsSection, COATypeSection } from './COATable';
import { SeedModal, MasterCOABrowser, DeactivateModal, HardDeleteModal, EditAccountModal } from './COAModals';
import { TYPE_ORDER, TYPE_LABELS } from './coaData';

export function ChartOfAccounts() {
  const coa = useCOA();
  const { cats, txns, accounts, PALETTE, catBalances, bankBalances, dateFrom, dateTo,
          suggestCode, onCatDragStart, onCatDragEnd, onCatDrop,
          saveAccount, deactivateAccount, reactivateAccount, hardDeleteAccount,
          seedAccounts, importFromMaster, masterCOA, toast } = coa;

  const [search,           setSearch]           = useState('');
  const [typeFilter,       setTypeFilter]        = useState('');
  const [showZero,         setShowZero]          = useState(true);
  const [showInactive,     setShowInactive]      = useState(false);
  const [drillCat,         setDrillCat]          = useState(null);
  const [collapsed,        setCollapsed]         = useState(new Set());
  const [editingId,        setEditingId]         = useState(null);
  const [form,             setForm]              = useState({});
  const [saving,           setSaving]            = useState(false);
  const [deleteTarget,     setDeleteTarget]      = useState(null);
  const [deleteSaving,     setDeleteSaving]      = useState(false);
  const [hardDeleteTarget, setHardDeleteTarget]  = useState(null);
  const [showSeedModal,    setShowSeedModal]     = useState(false);
  const [showMasterCOA,    setShowMasterCOA]     = useState(false);
  const [importing,        setImporting]         = useState(false);

  function toggleCollapse(id) { setCollapsed(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); }

  function openNew() {
    const code = suggestCode('expense','');
    setForm({ label:'', type:'expense', account_group:'', colour:PALETTE[(cats||[]).length%PALETTE.length], code });
    setEditingId('new');
  }
  function openEdit(cat) { setForm({ label:cat.l, type:cat.t, account_group:cat.ac, colour:cat.col, sort_order:cat.sort_order, code:cat.code||'', parent_id:cat.parent_id||null }); setEditingId(cat.id); }

  async function handleSave() { setSaving(true); const ok=await saveAccount(editingId,form); if(ok) setEditingId(null); setSaving(false); }
  async function handleDeactivate() { if(!deleteTarget) return; setDeleteSaving(true); const ok=await deactivateAccount(deleteTarget); if(ok) setDeleteTarget(null); setDeleteSaving(false); }
  async function handleHardDelete() { if(!hardDeleteTarget) return; const ok=await hardDeleteAccount(hardDeleteTarget); if(ok){setHardDeleteTarget(null);if(drillCat?.id===hardDeleteTarget.id)setDrillCat(null);} }
  async function handleSeed(mode,tKey,tMap) { setSaving(true); const ok=await seedAccounts(mode,tKey,tMap); if(ok) setShowSeedModal(false); setSaving(false); }
  async function handleImport(sel,list) { setImporting(true); const ok=await importFromMaster(sel,list); if(ok) setShowMasterCOA(false); setImporting(false); }

  const typesToShow = TYPE_ORDER.filter(t => !typeFilter || t === typeFilter);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ position:'sticky', top:-16, zIndex:100, background:'var(--sand)', borderBottom:'0.5px solid var(--bd)', padding:'10px 18px', marginTop:-16, marginLeft:-18, marginRight:-18, marginBottom:16, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 8px rgba(42,36,32,0.08)' }}>
        <input placeholder="Search accounts…" value={search} onChange={e=>setSearch(e.target.value)} style={{ padding:'6px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', color:'var(--ink)', fontFamily:'var(--font-sans)', width:200 }}/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{ padding:'6px 10px', fontSize:12.5, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', background:'var(--sand)', color:'var(--ink)', fontFamily:'var(--font-sans)' }}>
          <option value="">All types</option>
          {TYPE_ORDER.map(t=><option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--stone)', cursor:'pointer' }}><input type="checkbox" checked={showZero} onChange={e=>setShowZero(e.target.checked)}/>Show zero</label>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--stone)', cursor:'pointer' }}><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>Show inactive</label>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button className="btn btn-sm" onClick={()=>setShowMasterCOA(true)}>Master COA</button>
          <button className="btn btn-sm" onClick={()=>setShowSeedModal(true)}>✦ Seed accounts</button>
          <button className="btn btn-a" onClick={openNew}>+ New account</button>
        </div>
      </div>

      {(!typeFilter||typeFilter==='asset')&&<BankAccountsSection accounts={accounts} txns={txns} bankBalances={bankBalances} search={search}/>}
      {typesToShow.map(type=>(
        <COATypeSection key={type} type={type} cats={cats} txns={txns} catBalances={catBalances}
          showInactive={showInactive} showZero={showZero} search={search}
          collapsed={collapsed} onToggleCollapse={toggleCollapse}
          onDrill={setDrillCat} onEdit={openEdit}
          onRequestDeactivate={cat=>setDeleteTarget({...cat,txnCount:(txns||[]).filter(t=>t.cat===cat.id).length})}
          onReactivate={reactivateAccount} onHardDelete={setHardDeleteTarget}
          onCatDragStart={onCatDragStart} onCatDragEnd={onCatDragEnd} onCatDrop={onCatDrop}/>
      ))}

      {cats.length===0&&<div className="card" style={{ textAlign:'center', padding:40 }}><p style={{ fontWeight:500, marginBottom:8 }}>No accounts yet</p><button className="btn btn-a" onClick={()=>setShowSeedModal(true)}>Seed chart of accounts</button></div>}

      {drillCat&&<COADrillPanel cat={drillCat} txns={txns} setTxns={coa.setTxns} cats={cats} dateFrom={dateFrom} dateTo={dateTo} onClose={()=>setDrillCat(null)} onEdit={()=>{openEdit(drillCat);setDrillCat(null);}} toast={toast}/>}
      {showSeedModal&&<SeedModal onClose={()=>setShowSeedModal(false)} onSeed={handleSeed} saving={saving}/>}
      {showMasterCOA&&<MasterCOABrowser masterCOA={masterCOA} cats={cats} onClose={()=>setShowMasterCOA(false)} onImport={handleImport} importing={importing}/>}
      <DeactivateModal target={deleteTarget} onClose={()=>setDeleteTarget(null)} onConfirm={handleDeactivate} saving={deleteSaving}/>
      <HardDeleteModal target={hardDeleteTarget} onClose={()=>setHardDeleteTarget(null)} onConfirm={handleHardDelete}/>
      <EditAccountModal editingId={editingId} form={form} setForm={setForm} cats={cats} PALETTE={PALETTE} onClose={()=>setEditingId(null)} onSave={handleSave} saving={saving}/>
    </div>
  );
}
