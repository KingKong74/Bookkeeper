/**
 * views/Accounting/Journals/journalHelpers.js
 * Pure functions for General Ledger assembly. No React, no side effects.
 */
export const TYPE_ORDER_GL = ['asset','liability','equity','income','expense'];

export function consolidateLines(lines, catMap, accountMap={}) {
  const map = {};
  for (const l of lines) {
    const key = l.category_id?`cat:${l.category_id}`:l.bank_account_id?`bank:${l.bank_account_id}`:`name:${l.account_name||'—'}`;
    const cat  = l.category_id&&catMap?catMap[l.category_id]:null;
    const acct = l.bank_account_id&&accountMap?accountMap[l.bank_account_id]:null;
    // Try name-matching for lines with only account_name (no bank_account_id)
    const nameMatchedAcct = (!acct && !cat && l.account_name)
      ? Object.values(accountMap).find(a => a.name && a.name.toLowerCase().trim() === (l.account_name||'').toLowerCase().trim())
      : null;
    const resolvedAcct = acct || nameMatchedAcct;
    const name = cat?(cat.l||cat.label):resolvedAcct?resolvedAcct.name:(l.account_name||l.ac||'—');
    const isLiabAcct = resolvedAcct && (resolvedAcct.type==='credit_card'||resolvedAcct.type==='loan');
    const type = cat?(cat.t||cat.type):resolvedAcct?(isLiabAcct?'liability':'asset'):null;
    if (!map[key]) map[key]={ key, account_name:name, code:cat?.code||null, type, parent_id:cat?.parent_id||null, cat_id:l.category_id||null, debit:0, credit:0 };
    map[key].debit  += parseFloat(l.debit ||l.dr||0);
    map[key].credit += parseFloat(l.credit||l.cr||0);
  }
  const rows = Object.values(map).filter(r=>r.debit>0.005||r.credit>0.005);
  if (catMap) {
    const rowIds=new Set(rows.map(r=>r.cat_id).filter(Boolean));
    [...new Set(rows.map(r=>r.parent_id).filter(Boolean))].forEach(pid=>{
      if(rowIds.has(pid)) return;
      const parent=catMap[pid]; if(!parent) return;
      const kids=rows.filter(r=>r.parent_id===pid);
      const dr=kids.reduce((s,r)=>s+r.debit,0), cr=kids.reduce((s,r)=>s+r.credit,0);
      if(!dr&&!cr) return;
      rows.push({key:`cat:${pid}`,account_name:parent.l,code:parent.code||null,type:parent.t,parent_id:null,cat_id:pid,debit:dr,credit:cr,synthetic:true});
    });
  }
  rows.sort((a,b)=>{
    const ta=TYPE_ORDER_GL.indexOf(a.type),tb=TYPE_ORDER_GL.indexOf(b.type);
    if(ta!==tb) return (ta===-1?99:ta)-(tb===-1?99:tb);
    const aIsParent=a.synthetic&&rows.some(r=>r.parent_id===a.cat_id);
    const bIsParent=b.synthetic&&rows.some(r=>r.parent_id===b.cat_id);
    if(aIsParent&&!bIsParent) return 1; if(bIsParent&&!aIsParent) return -1;
    return (parseInt(a.code)||9999)-(parseInt(b.code)||9999);
  });
  return rows;
}
