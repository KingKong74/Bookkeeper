/**
 * views/Banking/Transactions/TransactionRow.jsx
 * Single transaction table row — category, payee, description, amount, status.
 */
import React from 'react';
import { fmt } from '../../../utils/helpers';
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
}) {
  const pending    = !t.cat && pendingCatMap[t.id];
  const isSelected = selected.has(t.id);
  const status     = t.cat ? 'done' : (pending ? 'pending' : 'todo');

  return (
    <tr
      style={{
        cursor: 'default',
        background: isSelected ? 'rgba(186,117,23,0.15)' : t.cat ? '#FAF3E4' : '#FDFAF6',
        opacity:    justAllocated.has(t.id) ? 0.3 : 1,
        transition: justAllocated.has(t.id) ? 'opacity 1s ease' : 'opacity 0.12s',
      }}
    >
      <td onClick={e => toggleSelect(e, t.id)} style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: 'pointer' }} />
      </td>
      <td style={{ color: 'var(--stone)', fontSize: 12 }}>
        {t.date}
        {!t.imported && <span style={{ fontSize: 9, padding: '1px 3px', borderRadius: 3, background: 'var(--al)', color: 'var(--a2)', fontWeight: 600, marginLeft: 4 }}>M</span>}
      </td>
      <td style={{ maxWidth: 0 }}>
        <InlineDescEditor txnId={t.id} value={t.desc} note={t.note} onSave={saveDesc} />
      </td>
      <td style={{ maxWidth: 0 }}>
        <InlinePayeePicker
          txnId={t.id} currentPayee={t.payee}
          payees={payees || []} setPayees={setPayees}
          onSelect={allocatePayee} org={org} PALETTE={PALETTE}
        />
      </td>
      <td style={{ maxWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
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
      <td className={`tr ${t.amt >= 0 ? 'vp' : 'vn'}`}>{t.amt >= 0 ? '+' : ''}{fmt(t.amt)}</td>
      {accountTab===null && (() => {
        const acct = (accounts || []).find(a => a.id === t.account_id);
        return (
          <td>
            {acct ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: acct.colour || '#888', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--stone2)' }}>{acct.name}</span>
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--sand4)', fontStyle: 'italic' }}>unlinked</span>
            )}
          </td>
        );
      })()}
      <td style={{ textAlign: 'center' }}>
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
