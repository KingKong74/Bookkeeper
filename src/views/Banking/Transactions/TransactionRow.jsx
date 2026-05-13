/**
 * views/Banking/Transactions/TransactionRow.jsx
 * Single transaction table row — category, payee, description, amount, status.
 */
import React from 'react';
import { fmt, fmtAcct } from '../../../utils/helpers';
import { InlineCatPicker }  from './InlineCatPicker';
import { InlinePayeePicker } from './InlinePayeePicker';
import { InlineDescEditor }  from './InlineDescEditor';

const ACCT_ICON = { checking:'🏦', savings:'💰', credit_card:'💳', loan:'📋', investment:'📈' };

export function TransactionRow({
  t, cats, catMap, payees, setPayees, accounts, accountTab,
  pendingCatMap, justAllocated, selected,
  allocateCat, allocatePayee, saveDesc, handleCreateCat,
  toggleSelect, requestDelete, setDetailId,
  org, PALETTE,
  runningBal,
  showBalance,
  compactView,
  allocTab,
}) {
  const pending    = !t.cat && pendingCatMap[t.id];
  const isSelected = selected.has(t.id);
  const status     = t.cat ? 'done' : (pending ? 'pending' : 'todo');

  // Xero-style two-panel view for Reconcile tab when compactView is off
  if (allocTab === 'uncategorised' && !compactView) {
    const hasSuggestion = pending && !t.cat;
    const sugCat = hasSuggestion && pending.sugCat ? catMap[pending.sugCat] : null;

    return (
      <tr
        className={isSelected ? 'txn-row--selected' : 'txn-row--pending'}
        style={{ opacity: justAllocated.has(t.id) ? 0.3 : 1, transition: justAllocated.has(t.id) ? 'opacity 1s ease' : 'opacity 0.12s' }}
      >
        {/* Checkbox */}
        <td onClick={e => toggleSelect(e, t.id)} style={{ cursor: 'pointer', paddingLeft: 10, verticalAlign: 'top', paddingTop: 12 }}>
          <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: 'pointer' }} />
        </td>

        {/* Left panel — bank statement line */}
        <td style={{ verticalAlign: 'top', borderRight: '0.5px solid var(--bd)', padding: '10px 14px 10px 6px' }}>
          <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>{t.date}</div>
          <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }} title={t.desc}>{t.desc}</div>
          {t.note && <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.note}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {t.amt < 0
              ? <span className="vn" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(Math.abs(t.amt))}</span>
              : <span className="vp" style={{ fontSize: 14, fontWeight: 600 }}>+{fmt(t.amt)}</span>
            }
            {(!t.imported && !t.basiq_txn_id && !t.import_hash) && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--al)', color: 'var(--a2)', fontWeight: 600 }}>Manual</span>}
          </div>
        </td>

        {/* Right panel — Who / What / Why + auto-apply */}
        <td style={{ padding: '10px 12px 10px 16px', verticalAlign: 'top' }}>
          {/* Auto-apply suggestion banner */}
          {hasSuggestion && sugCat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '6px 10px', borderRadius: 'var(--rr)', background: pending.fromIntel ? 'rgba(83,74,183,0.08)' : 'var(--al)', border: `0.5px solid ${pending.fromIntel ? 'rgba(83,74,183,0.25)' : 'rgba(186,117,23,0.3)'}` }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: pending.fromIntel ? '#534AB7' : 'var(--a2)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                {pending.fromIntel ? '✦ AI' : '⚡ Rule'}
              </span>
              <span style={{ flex: 1, fontSize: 11.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sugCat.l}{pending.sugPayee ? ` · ${pending.sugPayee}` : ''}
              </span>
              <button
                onClick={e => { e.stopPropagation(); allocateCat(t.id, pending.sugCat); }}
                style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 'var(--rr)', border: 'none', cursor: 'pointer', background: pending.fromIntel ? '#534AB7' : 'var(--a)', color: '#fff', fontSize: 11, fontWeight: 600 }}
              >Apply</button>
            </div>
          )}

          {/* Who / What / Why grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: '5px 10px', alignItems: 'start' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 6 }}>Who</div>
            <div style={{ minWidth: 0 }}>
              <InlinePayeePicker txnId={t.id} currentPayee={t.payee} payees={payees || []} setPayees={setPayees} onSelect={allocatePayee} org={org} PALETTE={PALETTE} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 6 }}>What</div>
            <div style={{ minWidth: 0 }}>
              <InlineCatPicker
                txnId={t.id} currentCatId={t.cat} cats={cats || []} catMap={catMap}
                onSelect={allocateCat} onCreateCat={handleCreateCat}
                suggestionCatId={(() => { const pc = pending?.sugCat ? catMap[pending.sugCat] : null; const sid = pc?.id; if (!sid) return null; return (cats || []).some(ch => ch.parent_id === sid && ch.is_active !== false) ? null : sid; })()}
                suggestionLabel={pending?.fromIntel ? 'intel' : 'rule'}
              />
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 6 }}>Why</div>
            <div style={{ minWidth: 0 }}>
              <InlineDescEditor txnId={t.id} value={t.desc} note={t.note} onSave={saveDesc} placeholder="Add a note…" compact />
            </div>
          </div>

          {/* Matched badge */}
          {t.cat && (
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: 'var(--gnb)', color: 'var(--gn)', fontSize: 11, fontWeight: 500 }}>
              ✓ Matched — {catMap[t.cat]?.l}
              <button onClick={e => { e.stopPropagation(); allocateCat(t.id, null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rd)', fontSize: 13, lineHeight: 1, padding: '0 0 0 4px', opacity: 0.7 }}>×</button>
            </div>
          )}
        </td>

        {/* Actions */}
        <td style={{ textAlign: 'right', paddingRight: 6, verticalAlign: 'top', paddingTop: 10 }}>
          <button className="btn-ghost" title="Open details" onClick={e => { e.stopPropagation(); setDetailId(t.id); }} style={{ padding: '2px 5px', fontSize: 12, color: 'var(--stone)', opacity: 0.6 }}>⤢</button>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={isSelected ? 'txn-row--selected' : t.cat ? 'txn-row--done' : 'txn-row--pending'}
      style={{
        cursor: 'default',
        opacity:    justAllocated.has(t.id) ? 0.3 : 1,
        transition: justAllocated.has(t.id) ? 'opacity 1s ease' : 'opacity 0.12s',
      }}
    >
      <td onClick={e => toggleSelect(e, t.id)} style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: 'pointer' }} />
      </td>
      <td style={{ color: 'var(--stone)', fontSize: 12, whiteSpace: 'nowrap' }}>
        {t.date}
        {(!t.imported && !t.basiq_txn_id && !t.import_hash) && <span style={{ fontSize: 9, padding: '1px 3px', borderRadius: 3, background: 'var(--al)', color: 'var(--a2)', fontWeight: 600, marginLeft: 4 }}>M</span>}
      </td>
      <td style={{ overflow: 'hidden', padding: '7px 8px 7px 10px' }}>
        <div style={{ overflow: 'hidden', width: '100%' }}>
          <InlineDescEditor txnId={t.id} value={t.desc} note={t.note} onSave={saveDesc} />
        </div>
      </td>
      <td style={{ overflow: 'hidden', padding: '7px 8px' }}>
        <div style={{ overflow: 'hidden', width: '100%' }}>
          <InlinePayeePicker
            txnId={t.id} currentPayee={t.payee}
            payees={payees || []} setPayees={setPayees}
            onSelect={allocatePayee} org={org} PALETTE={PALETTE}
          />
        </div>
      </td>
      <td style={{ overflow: 'hidden', padding: '7px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0, width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineCatPicker
              txnId={t.id}
              currentCatId={t.cat}
              cats={cats || []}
              catMap={catMap}
              onSelect={allocateCat}
              onCreateCat={handleCreateCat}
              suggestionCatId={(() => {
                const pendingCat = pending?.sugCat ? catMap[pending.sugCat] : null;
                const sid = pendingCat ? pendingCat.id : null;
                if (!sid) return null;
                const hasSubs = (cats || []).some(ch => ch.parent_id === sid && ch.is_active !== false);
                return hasSubs ? null : sid;
              })()}
              suggestionLabel={pending?.fromIntel ? 'intel' : 'rule'}
            />
          </div>
          {pending && !t.cat && (
            <button
              onClick={e => { e.stopPropagation(); }}
              title="Dismiss suggestion"
              style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--stone)', fontSize: 13, padding: '0 3px', lineHeight: 1, opacity: 0.5 }}
            >×</button>
          )}
        </div>
      </td>
      <td className="tr vn" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', padding: '7px 10px 7px 4px' }}>
        {t.amt < 0 ? fmt(Math.abs(t.amt)) : ''}
      </td>
      <td className="tr vp" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', padding: '7px 10px 7px 4px' }}>
        {t.amt >= 0 ? fmt(t.amt) : ''}
      </td>
      {showBalance && (
        <td className="tr" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: runningBal == null ? 'var(--stone2)' : runningBal < -0.005 ? 'var(--rd)' : 'var(--ink)', opacity: runningBal == null ? 0.4 : 1 }}>
          {runningBal != null ? fmtAcct(runningBal) : '—'}
        </td>
      )}
      {accountTab===null && (() => {
        const acct = (accounts || []).find(a => a.id === t.account_id);
        return (
          <td>
            {acct ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: acct.colour || '#888', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80, display: 'inline-block', verticalAlign: 'middle', color: 'var(--stone2)' }}>{acct.name}</span>
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--sand4)', fontStyle: 'italic' }}>unlinked</span>
            )}
          </td>
        );
      })()}
      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        {status==='done' && <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 4, background: 'var(--gnb)', color: 'var(--gn)', fontWeight: 600, letterSpacing: '0.02em', display: 'inline-block', minWidth: 50, textAlign: 'center' }}>Done</span>}
        {status==='pending' && (
          pending?.fromIntel
            ? <span title={`Suggested: ${pending?.reason || 'Merchant intelligence'}`} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.04em', display: 'inline-block', minWidth: 50, textAlign: 'center', background: 'rgba(83,74,183,0.12)', color: '#534AB7', border: '0.5px solid rgba(83,74,183,0.3)', cursor: 'default' }}>Suggest</span>
            : <span title={`Rule: ${pending?.rule || 'Auto-cat rule'}`} style={{ fontSize: 10, padding: '2px 10px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.04em', display: 'inline-block', minWidth: 50, textAlign: 'center', background: 'var(--al)', color: 'var(--a2)', border: '0.5px solid rgba(186,117,23,0.3)', cursor: 'default' }}>Match</span>
        )}
        {status==='todo' && <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 4, background: 'var(--rdb)', color: 'var(--rd)', fontWeight: 600, letterSpacing: '0.02em', display: 'inline-block', minWidth: 50, textAlign: 'center' }}>!</span>}
      </td>
      <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0 6px 0 0' }}>
        <button className="btn-ghost" title="Open details" onClick={e => { e.stopPropagation(); setDetailId(t.id); }} style={{ padding: '2px 5px', fontSize: 12, color: 'var(--stone)', opacity: 0.6 }}>⤢</button>
        <button className="btn-ghost" title="Delete" onClick={e => requestDelete(e, t)} style={{ padding: '2px 5px', fontSize: 13, color: 'var(--stone)' }}>×</button>
      </td>
    </tr>
  );
}
