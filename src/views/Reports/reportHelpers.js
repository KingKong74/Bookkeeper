/**
 * views/Reports/reportHelpers.js
 * Pure helper functions — no React, no side effects.
 */

export function priorPeriod(from, to) {
  const f=new Date(from),t=new Date(to),days=Math.round((t-f)/86400000)+1;
  const pf=new Date(f);pf.setDate(pf.getDate()-days);const pt=new Date(f);pt.setDate(pt.getDate()-1);
  return [pf.toISOString().slice(0,10),pt.toISOString().slice(0,10)];
}

export function getPriorDates(compare, dateFrom, dateTo) {
  if (!compare||compare==='none') return null;
  if (compare==='prior') return priorPeriod(dateFrom,dateTo);
  if (compare==='year') { const f=new Date(dateFrom),t=new Date(dateTo);f.setFullYear(f.getFullYear()-1);t.setFullYear(t.getFullYear()-1);return[f.toISOString().slice(0,10),t.toISOString().slice(0,10)]; }
  if (compare==='ytd')  { const today=new Date(),fyYear=today.getMonth()>=6?today.getFullYear():today.getFullYear()-1;return[`${fyYear}-07-01`,today.toISOString().slice(0,10)]; }
  return null;
}

export function addSyntheticParents(rows, catMap) {
  const rowIds=new Set(rows.map(r=>r.cat_id).filter(Boolean));
  const TYPE_ORD=['asset','liability','equity','income','expense'];
  const extra=[...new Set(rows.map(r=>r.parent_id).filter(Boolean))].filter(pid=>!rowIds.has(pid)).map(pid=>{
    const parent=catMap[pid];if(!parent)return null;
    const kids=rows.filter(r=>r.parent_id===pid);
    const dr=kids.reduce((s,r)=>s+(r.dr||0),0),cr=kids.reduce((s,r)=>s+(r.cr||0),0);
    if(!dr&&!cr) return null;
    return{key:`cat:${pid}`,label:parent.l,type:parent.t,col:parent.col,cat_id:pid,code:parent.code||null,parent_id:null,dr,cr,net:cr-dr,synthetic:true};
  }).filter(Boolean);
  if(!extra.length) return rows;
  const allRows=[...rows,...extra];
  allRows.sort((a,b)=>{const ta=TYPE_ORD.indexOf(a.type),tb=TYPE_ORD.indexOf(b.type);if(ta!==tb)return(ta===-1?99:ta)-(tb===-1?99:tb);const aRoot=a.parent_id?(allRows.find(r=>r.cat_id===a.parent_id)?.code||a.code||'9999'):(a.code||'9999');const bRoot=b.parent_id?(allRows.find(r=>r.cat_id===b.parent_id)?.code||b.code||'9999'):(b.code||'9999');const aN=parseInt(aRoot)||9999,bN=parseInt(bRoot)||9999;if(aN!==bN)return aN-bN;if(a.synthetic&&!b.synthetic)return-1;if(!a.synthetic&&b.synthetic)return 1;return(parseInt(a.code)||9999)-(parseInt(b.code)||9999);});
  return allRows;
}

export function addPLParents(lines, catMap) {
  if(!lines?.length) return lines||[];
  const lineIds=new Set(lines.map(x=>x.id));const extra=[];
  [...new Set(lines.map(x=>x.parent_id).filter(Boolean))].forEach(pid=>{if(lineIds.has(pid))return;const parent=catMap[pid];if(!parent)return;const kids=lines.filter(x=>x.parent_id===pid);const dr=kids.reduce((s,x)=>s+(x.dr||0),0),cr=kids.reduce((s,x)=>s+(x.cr||0),0);extra.push({...parent,id:pid,l:parent.l,t:parent.t,dr,cr,total:cr-dr,synthetic:true,parent_id:null});});
  if(!extra.length) return lines;
  return [...lines,...extra].sort((a,b)=>(parseInt(a.code)||9999)-(parseInt(b.code)||9999));
}

export function buildByPayee(transactions, catMap, payeeById) {
  const m={};
  transactions.forEach(t=>{const k=(t.payee_id&&payeeById[t.payee_id])||(t.payee||'').trim()||'(No payee)';if(!m[k])m[k]={total:0,count:0,income:0,expense:0,cats:new Set()};m[k].total+=t.amt;m[k].count++;if(t.amt>0)m[k].income+=t.amt;else m[k].expense+=Math.abs(t.amt);const ctg=catMap[t.cat];if(ctg)m[k].cats.add(ctg.l);});
  return m;
}

export function subCodeLabel(code, isSub) {
  if (!code) return '';
  if (isSub&&code.includes('/')) return '/'+code.split('/')[1];
  return code;
}
