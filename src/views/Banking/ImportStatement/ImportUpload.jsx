/**
 * views/Banking/ImportStatement/ImportUpload.jsx
 * Upload step: account selector + file drop zone.
 */
import React from 'react';

const FILE_ICON = (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ opacity: 0.4 }}>
    <rect x="6" y="2" width="24" height="32" rx="3" stroke="var(--stone)" strokeWidth="2" fill="none"/>
    <path d="M24 2L30 8V34" stroke="var(--stone)" strokeWidth="2" strokeLinejoin="round" fill="none"/>
    <path d="M24 2L30 8H24V2Z" fill="var(--sand3)" stroke="var(--stone)" strokeWidth="2" strokeLinejoin="round"/>
    <line x1="10" y1="16" x2="26" y2="16" stroke="var(--bd2)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="10" y1="21" x2="26" y2="21" stroke="var(--bd2)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="10" y1="26" x2="20" y2="26" stroke="var(--bd2)" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="18" y="6" width="24" height="32" rx="3" fill="var(--bg-card)" stroke="var(--stone)" strokeWidth="2"/>
    <path d="M36 6L42 12H36V6Z" fill="var(--sand3)" stroke="var(--stone)" strokeWidth="2" strokeLinejoin="round"/>
    <line x1="22" y1="18" x2="38" y2="18" stroke="var(--bd2)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="22" y1="23" x2="38" y2="23" stroke="var(--bd2)" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="22" y1="28" x2="32" y2="28" stroke="var(--bd2)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export function ImportUpload({ accounts, selectedAccount, setSelectedAccount, onFiles, loading, onNavigate }) {
  function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = '';
    e.currentTarget.style.background  = '';
    onFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div className="card">
        <div className="ch"><h3>Import bank statements</h3></div>
        <div style={{ padding: 20 }}>

          {/* Account selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--stone)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Import to account
            </label>
            {accounts.length === 0 ? (
              <div style={{ padding: '10px 12px', background: 'var(--sand2)', borderRadius: 'var(--rr)', fontSize: 12, color: 'var(--stone)' }}>
                No bank accounts yet.{' '}
                <span style={{ color: 'var(--a)', cursor: 'pointer' }} onClick={() => onNavigate('accounts')}>Add one first →</span>
              </div>
            ) : (
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
                style={{ padding: '7px 10px', fontSize: 13, border: '0.5px solid var(--bd2)', borderRadius: 'var(--rr)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', width: '100%', maxWidth: 320 }}>
                <option value="">— Select account (or choose later) —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type.replace('_', ' ')})</option>)}
              </select>
            )}
          </div>

          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--al)', borderRadius: 'var(--rr)', fontSize: 12, color: 'var(--a2)', lineHeight: 1.6 }}>
            Supports <strong>PDF</strong> and <strong>CSV</strong> from ANZ, CBA, NAB, and Westpac.{' '}
            Select <strong>multiple files</strong> at once — they'll be merged into one review table.
          </div>

          {/* Drop zone */}
          <div
            style={{ border: '1.5px dashed var(--sand4)', borderRadius: 'var(--rl)', padding: '48px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
            onClick={() => document.getElementById('import-file-in').click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#BA7517'; e.currentTarget.style.background = 'var(--al)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = ''; }}
            onDrop={handleDrop}
          >
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--stone)' }}>Parsing files…</p>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>{FILE_ICON}</div>
                <p style={{ fontSize: 13.5, color: 'var(--stone2)', fontWeight: 500, marginBottom: 6 }}>Drop files here, or click to browse</p>
                <p style={{ fontSize: 12, color: 'var(--stone)' }}>PDF or CSV · ANZ, CBA, NAB, Westpac · Multiple files OK</p>
              </>
            )}
          </div>

          <input type="file" id="import-file-in" multiple accept=".csv,.pdf"
            style={{ display: 'none' }}
            onChange={e => onFiles(e.target.files)} />
        </div>
      </div>
    </div>
  );
}
