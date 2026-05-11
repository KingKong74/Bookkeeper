/**
 * views/Banking/ImportStatement/ImportReviewTable.jsx
 * The transaction review table — file section headers, row checkboxes,
 * Spent/Received columns, auto-cat suggestions.
 */
import React from 'react';
import { fmt } from '../../../utils/helpers';
import { fmtAmt, calcRecon } from './importHelpers';

export function ImportReviewTable({
  sortedParsedFiles, fileTransactions, fileRowRefs,
  allTransactions, excluded, selectedCountByFile,
  autoCatMap, catMap,
  toggleRow, toggleFile, toggleAll,
  selectedRows, selectedSummary,
}) {
  // Build running balance map: txnKey → cumulative balance for that file
  // Starts from the file's opening balance (from statement summary) and adds txns oldest→newest
  const runningBalMap = {};
  sortedParsedFiles.forEach((pf, fi) => {
    const ob   = pf.summary?.openingBalance ?? null;
    const txns = fileTransactions[fi] || [];
    if (ob === null && txns.length === 0) return;
    // Sort oldest first for correct running balance direction
    const ordered = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    let running = ob ?? 0;
    ordered.forEach(t => {
      running += t.amt ?? 0;
      runningBalMap[t._key] = running;
    });
  });
  if (allTransactions.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ fontWeight: 500, marginBottom: 6 }}>No transactions found</p>
        <p style={{ fontSize: 12, color: 'var(--stone)' }}>The parser couldn't extract transactions from these files.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
      <table style={{ tableLayout: 'fixed', width: '100%', minWidth: 860 }}>
        <colgroup>
          <col style={{ width: 36 }} />
          <col style={{ width: 90 }} />
          <col />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 155 }} />
          <col style={{ width: 115 }} />
          <col style={{ width: 115 }} />
        </colgroup>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
          <tr>
            <th style={{ padding: '0 0 0 10px' }}>
              <input type="checkbox" checked={excluded.size === 0} onChange={e => toggleAll(e.target.checked)} style={{ cursor: 'pointer', display: 'block' }} />
            </th>
            <th>Date</th>
            <th>Description</th>
            <th className="tr" style={{ color: 'var(--rd)', paddingRight: 10 }}>Spent</th>
            <th className="tr" style={{ color: 'var(--gn)', paddingRight: 10 }}>Received</th>
            <th className="tr" style={{ color: 'var(--stone)', paddingRight: 10 }}>Balance</th>
            <th>Category</th>
            <th>Payee</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {sortedParsedFiles.map((pf, fi) => {
            const fileTxns      = fileTransactions[fi] || [];
            if (fileTxns.length === 0 && !pf.error) return null;
            const fileSelectedCnt = selectedCountByFile[fi] || 0;
            const recon = calcRecon(pf, excluded);

            return (
              <React.Fragment key={fi}>
                {/* File section header */}
                <tr ref={el => { fileRowRefs.current[fi] = el; }} style={{ background: 'var(--sand2)' }}>
                  <td>
                    <input type="checkbox"
                      checked={fileTxns.length > 0 && fileTxns.every(t => !excluded.has(t._key))}
                      onChange={() => toggleFile(fi)}
                      style={{ cursor: 'pointer' }} />
                  </td>
                  <td colSpan={8} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, color: 'var(--stone)', letterSpacing: '0.04em' }}>
                    📄 {pf.filename}
                    {pf.error
                      ? <span style={{ color: 'var(--rd)', marginLeft: 8, fontWeight: 400 }}>Parse error: {pf.error}</span>
                      : <>
                          <span style={{ fontWeight: 400, color: 'var(--stone)', marginLeft: 8 }}>
                            {fileSelectedCnt}/{fileTxns.length} selected
                            {pf.summary?.period && ` · ${pf.summary.period}`}
                          </span>
                          {recon && (
                            <span style={{ marginLeft: 12, padding: '1px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: recon.balanced ? 'var(--gnb)' : 'var(--rdb)', color: recon.balanced ? 'var(--gn)' : 'var(--rd)' }}>
                              {recon.balanced ? '✓ Reconciled' : `Off by ${fmt(recon.diff)}`}
                            </span>
                          )}
                        </>
                    }
                  </td>
                </tr>

                {/* Reconciliation detail */}
                {recon && !pf.error && (
                  <tr style={{ background: recon.balanced ? 'rgba(59,109,17,0.04)' : 'rgba(163,45,45,0.04)' }}>
                    <td />
                    <td colSpan={8} style={{ padding: '4px 10px', fontSize: 11, color: 'var(--stone)' }}>
                      <span style={{ marginRight: 16 }}>Opening: <strong>{fmt(recon.openingBalance)}</strong></span>
                      <span style={{ marginRight: 16 }}>Closing: <strong>{fmt(recon.closingBalance)}</strong></span>
                      <span style={{ marginRight: 16 }}>Credits: <span className="vp">{fmt(recon.totalCredits)}</span></span>
                      <span style={{ marginRight: 16 }}>Debits: <span className="vn">-{fmt(recon.totalDebits)}</span></span>
                      {!recon.balanced && <span style={{ color: 'var(--rd)' }}>Expected: {fmt(Math.abs(recon.expected))} · Got: {fmt(Math.abs(recon.sumOfTxns))}</span>}
                    </td>
                  </tr>
                )}

                {/* Transaction rows */}
                {fileTxns.map(t => {
                  const isExcluded = excluded.has(t._key);
                  const sug        = autoCatMap[t._key];
                  const sugCat     = sug?.sugCat ? catMap[sug.sugCat] : null;
                  return (
                    <tr key={t._key} onClick={() => toggleRow(t._key)}
                      style={{ opacity: isExcluded ? 0.4 : 1, transition: 'opacity 0.1s', cursor: 'pointer' }}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={!isExcluded} onChange={() => toggleRow(t._key)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ color: 'var(--stone)', fontSize: 12, whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</td>
                      <td className="tr vn" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{t.amt < 0  ? fmtAmt(Math.abs(t.amt)) : ''}</td>
                      <td className="tr vp" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{t.amt >= 0 ? fmtAmt(t.amt) : ''}</td>
                      <td className="tr" style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: runningBalMap[t._key] != null ? (runningBalMap[t._key] < 0 ? 'var(--rd)' : 'var(--ink)') : 'var(--stone)' }}>
                        {runningBalMap[t._key] != null
                          ? (runningBalMap[t._key] < 0 ? '-' : '') + fmtAmt(Math.abs(runningBalMap[t._key]))
                          : <span style={{ opacity: 0.35 }}>—</span>}
                      </td>
                      <td>
                        {sugCat
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 99, fontSize: 10.5, fontWeight: 500, background: `${sugCat.col}18`, color: sugCat.col, border: `0.5px solid ${sugCat.col}44` }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: sugCat.col, display: 'inline-block' }} />{sugCat.l}
                            </span>
                          : <span style={{ fontSize: 11, color: 'var(--stone)', fontStyle: 'italic' }}>—</span>
                        }
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--stone)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                        {sug?.sugPayee ? sug.sugPayee : <span style={{ color: 'var(--stone)', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--stone)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{t._file}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--sand2)', borderTop: '0.5px solid var(--bd2)' }}>
            <td colSpan={3} style={{ padding: '8px 12px', fontWeight: 500, fontSize: 12 }}>
              {selectedRows.length} selected across {sortedParsedFiles.filter(p => !p.error).length} file{sortedParsedFiles.length !== 1 ? 's' : ''}
            </td>
            <td className="tr vn" style={{ padding: '8px 12px', fontSize: 12 }}>{fmtAmt(Math.abs(selectedSummary.debitTotal))}</td>
            <td className="tr vp" style={{ padding: '8px 12px', fontSize: 12 }}>{fmtAmt(selectedSummary.creditTotal)}</td>
            <td />
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
