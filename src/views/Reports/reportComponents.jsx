/**
 * views/Reports/reportComponents.jsx
 * Shared display components for all report pages.
 */
import React from 'react';
import { useApp } from '../../context/AppContext';

export function A4Paper({ title, subtitle, children, wide=false }) {
  const { org } = useApp();
  const today = new Date().toLocaleDateString('en-AU', { day:'2-digit', month:'long', year:'numeric' });
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  return (
    <div className="a4-paper" style={{ maxWidth: wide ? 1060 : 760, margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
      <div style={{ padding: '24px 32px 18px', borderBottom: '2px solid var(--ink)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Moniqr branding — uses the same icon as sidebar */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <img
                src={isDark ? '/icon-dark.png' : '/icon-light.png'}
                alt="Moniqr"
                style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0 }}
              />
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Moniqr</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--stone)' }}>{org?.name || 'Personal accounts'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--stone)', marginTop: 3 }}>{subtitle}</div>}
            <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 3 }}>Prepared {today}</div>
          </div>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function StHead({children}){return<div style={{ padding:'7px 32px 3px', fontSize:10, fontWeight:600, color:'var(--stone)', letterSpacing:'0.07em', textTransform:'uppercase', background:'var(--sand)', borderBottom:'0.5px solid var(--bd)' }}>{children}</div>;}
export function StRow({label,value,valueB,indent=false,sub=false,valueClass='',onClick,clickable=false,isParentHeader=false}){const leftPad = sub ? '72px' : indent ? '44px' : '32px';return(<div onClick={onClick} style={{ display:'flex', justifyContent:'space-between', padding:`${sub?'3px':'5px'} 32px ${sub?'3px':'5px'} ${leftPad}`, borderBottom:isParentHeader?'none':'0.5px solid var(--bd)', fontSize:sub?11.5:12.5, cursor:clickable&&!isParentHeader?'pointer':'default', alignItems:'center' }} onMouseEnter={e=>{if(clickable&&!isParentHeader)e.currentTarget.style.background='var(--al)';}} onMouseLeave={e=>{e.currentTarget.style.background='';}}><span style={{ color:'var(--ink)', display:'flex', alignItems:'center', gap:5, fontWeight:isParentHeader?600:400 }}>{label}{clickable&&!isParentHeader&&<span style={{ fontSize:10, color:'var(--stone)', opacity:0.6 }}>↗</span>}</span><div style={{ display:'flex', gap:32, flexShrink:0, paddingRight: sub ? '24px' : '0' }}><span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right' }}>{value}</span>{valueB!==undefined&&<span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone2)', minWidth:90, textAlign:'right', fontSize:12 }}>{valueB}</span>}</div></div>);}
export function StGroupTotal({label,value,valueB,valueClass=''}){return(<div style={{ display:'flex', justifyContent:'space-between', padding:'4px 32px 6px 40px', fontSize:12, alignItems:'center', marginBottom:6, borderTop:'0.5px solid var(--bd)' }}><span style={{ color:'var(--stone)', fontSize:12, fontWeight:500 }}>{label} total</span><div style={{ display:'flex', gap:32, flexShrink:0 }}><span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right', fontWeight:500, borderBottom:'1.5px solid var(--ink)', paddingBottom:1 }}>{value}</span>{valueB!==undefined&&<span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone2)', minWidth:90, textAlign:'right', fontSize:12, borderBottom:'1.5px solid var(--stone)', paddingBottom:1 }}>{valueB}</span>}</div></div>);}
export function StTotal({label,value,valueB,valueClass=''}){return(<div style={{ display:'flex', justifyContent:'space-between', padding:'7px 32px', fontWeight:600, fontSize:12.5, borderTop:'1px solid var(--bd2)', background:'var(--sand)', alignItems:'center' }}><span>{label}</span><div style={{ display:'flex', gap:32, flexShrink:0 }}><span className={valueClass} style={{ fontVariantNumeric:'tabular-nums', minWidth:90, textAlign:'right' }}>{value}</span>{valueB!==undefined&&<span style={{ fontVariantNumeric:'tabular-nums', color:'var(--stone2)', minWidth:90, textAlign:'right', fontSize:12 }}>{valueB}</span>}</div></div>);}
export function StGrand({label,value,valueB,valueClass=''}){return<div style={{ display:'flex', justifyContent:'space-between', padding:'10px 32px', fontWeight:600, fontSize:13.5, background:'var(--al)', borderTop:'1.5px solid var(--a)' }}><span>{label}</span><span className={valueClass} style={{ fontVariantNumeric:'tabular-nums' }}>{value}</span></div>;}
export function CompareHeader({labelA,labelB}){return(<div style={{ display:'flex', justifyContent:'flex-end', padding:'4px 32px', gap:32, borderBottom:'0.5px solid var(--bd)', background:'var(--sand)' }}><span style={{ fontSize:10, fontWeight:600, color:'var(--ink)', textTransform:'uppercase', letterSpacing:'0.05em', minWidth:90, textAlign:'right' }}>{labelA} (current)</span><span style={{ fontSize:10, fontWeight:600, color:'var(--stone)', textTransform:'uppercase', letterSpacing:'0.05em', minWidth:90, textAlign:'right' }}>{labelB} (prior)</span></div>);}
export function CompareBar({compare,setCompare}){return(<div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, padding:'8px 12px', background:'var(--sand)', borderRadius:'var(--rr)', border:'0.5px solid var(--bd)' }}><span style={{ fontSize:11.5, color:'var(--stone)', fontWeight:500, marginRight:4 }}>⇄ Compare:</span>{[['none','Off'],['prior','Prior period'],['year','Prior year'],['ytd','YTD']].map(([v,l])=><button key={v} onClick={()=>setCompare(v)} style={{ padding:'4px 12px', fontSize:12, border:'0.5px solid var(--bd2)', borderRadius:'var(--rr)', cursor:'pointer', fontFamily:'var(--font-sans)', background:compare===v?'var(--a)':'var(--sand)', color:compare===v?'#fff':'var(--stone)', fontWeight:compare===v?500:400, transition:'all 0.12s' }}>{l}</button>)}{compare!=='none'&&<span style={{ marginLeft:'auto', fontSize:11, color:'var(--a2)', fontStyle:'italic' }}>Click any row to drill into transactions</span>}</div>);}
export function BSRow({label,value,valueB,isNeg=false,onClick,clickable=false}){return(<div onClick={onClick} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 32px', fontSize:12.5, cursor:clickable?'pointer':'default' }} onMouseEnter={e=>{if(clickable)e.currentTarget.style.background='var(--al)';}} onMouseLeave={e=>{e.currentTarget.style.background=''}}><span style={{ color:'var(--ink)', display:'flex', alignItems:'center', gap:5 }}>{label}{clickable&&<span style={{ fontSize:10, color:'var(--stone)', opacity:0.5 }}>↗</span>}</span><div style={{ display:'flex', gap:32 }}><span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', color:isNeg?'var(--rd)':'var(--a2)', fontSize:12.5 }}>{value}</span>{valueB!==undefined&&<span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', color:'var(--stone2)', fontSize:12 }}>{valueB}</span>}</div></div>);}
export function BSTotalRow({label,value,valueB,isNeg=false,bold=false,underline=false}){return(<div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 32px', borderTop:'0.5px solid var(--bd)', marginTop:2, fontSize:12.5 }}><span style={{ fontWeight:bold?600:500, color:'var(--ink)' }}>{label}</span><div style={{ display:'flex', gap:32 }}><span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', fontWeight:bold?600:500, color:isNeg?'var(--rd)':'var(--ink)', borderBottom:underline?'2px solid var(--ink)':bold?'1px solid var(--bd2)':undefined, paddingBottom:2 }}>{value}</span>{valueB!==undefined&&<span style={{ fontVariantNumeric:'tabular-nums', minWidth:110, textAlign:'right', color:'var(--stone2)', fontSize:12 }}>{valueB}</span>}</div></div>);}
