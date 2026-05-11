/**
 * unit.coa_payee.test.js
 * Tests for:
 *   - showZeroPay state declared in PayeeReport
 *   - dragPayeeRef declared in PayeeReport
 *   - COA duplicate code check (new AND updates)
 *   - COA type-change confirmation guard
 *   - COA sub-account code sync when parent code changes
 *   - GL └ removed
 */
import { describe, it, expect, beforeAll } from 'vitest';

// ── PayeeReport state declarations ────────────────────────────────────────────
describe('PayeeReport — state declarations', () => {
  let src;
  beforeAll(async () => {
    const fs = await import('fs');
    src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
  });

  it('showZeroPay is declared as useState', () => {
    expect(src).toContain('const [showZeroPay');
    expect(src).toContain('setShowZeroPay');
  });

  it('showZeroPay declaration is before its use', () => {
    const decl = src.indexOf('const [showZeroPay');
    const use  = Math.max(src.indexOf('showZeroPay?(payees'), src.indexOf('showZeroPay ? (payees'));
    expect(decl).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(use);
  });

  it('payeeSearch filter state is declared', () => {
    expect(src).toContain('const [payeeSearch');
    expect(src).toContain('setPayeeSearch');
  });

  it('sort state (sortCol + sortDir) is declared', () => {
    expect(src).toContain('const [sortCol');
    expect(src).toContain('const [sortDir');
  });

  it('drag has been removed (no draggable on rows)', () => {
    // Drag feature removed — rows no longer have drag events
    const trIdx = src.indexOf("rows.map(([name,v], ri)=>");
    const trBlock = src.slice(trIdx, trIdx + 300);
    expect(trBlock).not.toContain('draggable');
    expect(trBlock).not.toContain('onDragStart');
  });
});

// ── COA duplicate code validation ─────────────────────────────────────────────
describe('COA — duplicate code validation', () => {
  function checkCodeConflict(cats, formCode, editingId) {
    return (cats||[]).find(x =>
      x.code === formCode.trim() && x.l && x.id !== editingId
    ) || null;
  }

  const cats = [
    { id:'c1', code:'800', l:'Groceries', t:'expense' },
    { id:'c2', code:'831', l:'Vehicle',   t:'expense' },
    { id:'c3', code:'831/001', l:'Fuel',  t:'expense', parent_id:'c2' },
  ];

  it('conflict found when new account uses existing code', () => {
    expect(checkCodeConflict(cats, '800', 'new')).not.toBeNull();
  });

  it('no conflict when new account has unique code', () => {
    expect(checkCodeConflict(cats, '850', 'new')).toBeNull();
  });

  it('conflict found when existing account changes to a taken code', () => {
    // Editing c1 and trying to use 831 (taken by c2)
    expect(checkCodeConflict(cats, '831', 'c1')).not.toBeNull();
  });

  it('no conflict when account keeps its own code', () => {
    // Editing c2 with same code 831 — should not conflict with itself
    expect(checkCodeConflict(cats, '831', 'c2')).toBeNull();
  });

  it('source: duplicate code check runs for both new AND updates', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/useCOA.js', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COAModals.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COATable.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COADrillPanel.jsx', import.meta.url), 'utf-8');
    const saveIdx = Math.max(src.indexOf('async function save()'), src.indexOf('async function saveAccount('));
    const saveIdx2 = saveIdx >= 0 ? saveIdx : src.indexOf('async function saveAccount(');
    const saveBody = src.slice(saveIdx2, saveIdx2 + 1000);
    // Must have the codeConflict check early in save()
    expect(saveBody).toContain('Duplicate code check');
    expect(saveBody).toContain('codeConflict');
    // Runs before setSaving(true) — before any async DB calls
    const conflictIdx = saveBody.indexOf('codeConflict');
    expect(conflictIdx).toBeGreaterThan(-1);
    // codeConflict must be in the first 600 chars (before DB calls)
    expect(conflictIdx).toBeLessThan(600);
  });
});

// ── COA type-change confirmation ──────────────────────────────────────────────
describe('COA — type change requires confirmation', () => {
  it('source: type change guard uses window.confirm', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/useCOA.js', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COAModals.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COATable.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COADrillPanel.jsx', import.meta.url), 'utf-8');
    // Changed from window.prompt/CONFIRM to window.confirm (more UX-friendly)
    expect(src).toContain("window.confirm(");
    expect(src).toContain("Type change cancelled");
  });

  it('source: type change check compares existing.t vs form.type', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/useCOA.js', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COAModals.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COATable.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COADrillPanel.jsx', import.meta.url), 'utf-8');
    expect(src).toContain("existing.t !== form.type");
  });

  it('type change guard only fires for existing accounts (not new)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/useCOA.js', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COAModals.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COATable.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COADrillPanel.jsx', import.meta.url), 'utf-8');
    const saveIdx = Math.max(src.indexOf('async function save()'), src.indexOf('async function saveAccount('));
    const saveBody = src.slice(saveIdx, saveIdx + 1500);
    // Guard must check editingId !== 'new'
    expect(saveBody).toContain("editingId !== 'new'");
  });
});

// ── COA sub-account code sync ─────────────────────────────────────────────────
describe('COA — sub-account code sync on parent code change', () => {
  function syncSubCodes(children, oldParentCode, newParentCode) {
    if (oldParentCode === newParentCode) return children;
    return children.map(ch => {
      const suffix = (ch.code||'').split('/')[1] || '';
      const newCode = suffix ? `${newParentCode}/${suffix}` : ch.code;
      return { ...ch, code: newCode };
    });
  }

  const children = [
    { id:'s1', code:'831/001', l:'Fuel',  parent_id:'p1' },
    { id:'s2', code:'831/002', l:'Rego',  parent_id:'p1' },
  ];

  it('syncs child codes when parent code changes', () => {
    const result = syncSubCodes(children, '831', '840');
    expect(result[0].code).toBe('840/001');
    expect(result[1].code).toBe('840/002');
  });

  it('no-op when parent code does not change', () => {
    const result = syncSubCodes(children, '831', '831');
    expect(result[0].code).toBe('831/001');
  });

  it('preserves suffix when syncing', () => {
    const result = syncSubCodes(children, '831', '900');
    expect(result[0].code).toBe('900/001');
    expect(result[1].code).toBe('900/002');
  });

  it('source: update path syncs child codes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/useCOA.js', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COAModals.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COATable.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COADrillPanel.jsx', import.meta.url), 'utf-8');
    expect(src).toContain('Sub-account codes synced');
    expect(src).toContain("oldCode !== form.code.trim()");
  });
});

// ── GL └ removed ──────────────────────────────────────────────────────────────
describe('GL — └ corner icon removed from sub-accounts', () => {
  it('└ is not rendered in GL sub-account rows', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/Journals/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/Journals/JournalList.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/Journals/GeneralLedger.jsx', import.meta.url), 'utf-8');
    expect(src).not.toContain('└');
  });
});

// ── COA reparenting ───────────────────────────────────────────────────────────
describe('COA — reparenting existing accounts', () => {
  it('source has parent selector in the edit form', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/useCOA.js', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COAModals.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COATable.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COADrillPanel.jsx', import.meta.url), 'utf-8');
    expect(src).toContain('Top-level (no parent)');
    expect(src).toContain('moved under new parent') || expect(src).toContain('newParentId');
  });

  it('source handles newParentId !== oldParentId in update branch', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/index.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/useCOA.js', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COAModals.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COATable.jsx', import.meta.url), 'utf-8') + '\n' + fs.readFileSync(new URL('../views/Accounting/ChartOfAccounts/COADrillPanel.jsx', import.meta.url), 'utf-8');
    expect(src).toContain('oldParentId');
    expect(src).toContain('newParentId !== oldParentId');
  });

  it('reparenting code: auto-updates code prefix when parent selected', () => {
    // Simulate the onChange handler for parent_id select
    function getNewCode(currentCode, parentCode) {
      const cur = (currentCode||'').replace(/.*\//, '');
      return parentCode + '/' + cur.padStart(3, '0');
    }
    expect(getNewCode('800', '831')).toBe('831/800');
    expect(getNewCode('001', '840')).toBe('840/001');
  });

  it('deparenting: removes prefix when parent cleared', () => {
    function getCodeOnDeparent(code) {
      return code.includes('/') ? code.split('/')[1] : code;
    }
    expect(getCodeOnDeparent('831/001')).toBe('001');
    expect(getCodeOnDeparent('800')).toBe('800'); // no-op for top-level
  });
});

// ── BS drill — bank account lines ─────────────────────────────────────────────
describe('BalanceSheet — drill on bank account lines', () => {
  it('source creates synthetic bsCat for bank lines', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('_isBankDrill:true');
  });

  it('DrillPanel filters by account_id when _isBankDrill', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    expect(src).toContain('cat._isBankDrill ? t.account_id === cat.id : allIds.has(t.cat)');
  });

  it('bsCat is not null for bank lines (drill is enabled)', () => {
    const catMap = { 'cat-1': { id:'cat-1', l:'Groceries', t:'expense' } };
    const bankLine = { id:'bank-1', l:'ANZ Checking', t:'asset', col:'#185FA5', type:'checking' };
    // Simulate the bsCat resolution
    const bsCat = catMap[bankLine.id] || (bankLine.id ? { id:bankLine.id, l:bankLine.l, col:bankLine.col||'#185FA5', t:bankLine.t||'asset', ac:bankLine.type||'asset', _isBankDrill:true } : null);
    expect(bsCat).not.toBeNull();
    expect(bsCat._isBankDrill).toBe(true);
  });

  it('DrillPanel with _isBankDrill filters txns by account_id', () => {
    const cat = { id:'bank-1', l:'ANZ Checking', _isBankDrill:true };
    const txns = [
      { id:'t1', account_id:'bank-1', cat:'cat-1', date:'2026-01-01', amt:-45 },
      { id:'t2', account_id:'bank-2', cat:'cat-1', date:'2026-01-02', amt:-30 },
      { id:'t3', account_id:'bank-1', cat:'cat-2', date:'2026-01-03', amt:1000 },
    ];
    const allIds = new Set([cat.id]);
    const filtered = txns.filter(t => cat._isBankDrill ? t.account_id === cat.id : allIds.has(t.cat));
    expect(filtered.map(t=>t.id)).toEqual(['t1','t3']);
  });
});

// ── P&L StRow visual cleanup ──────────────────────────────────────────────────
describe('P&L StRow — no ◆, no italic in totals', () => {
  it('StRow does not render ◆ diamond icon', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    const stRowStart = src.indexOf('function StRow(');
    const stRowEnd   = src.indexOf('\nfunction StGroupTotal', stRowStart);
    const stRowBody  = src.slice(stRowStart, stRowEnd);
    expect(stRowBody).not.toContain('◆');
  });

  it('StGroupTotal uses fontWeight:500 not fontStyle:italic', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx','../views/Reports/reportComponents.jsx'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    const totalStart = src.indexOf('function StGroupTotal(');
    const totalEnd   = Math.max(src.indexOf('\nfunction StTotal', totalStart), src.indexOf('\nexport function StTotal', totalStart));
    const totalBody  = src.slice(totalStart, totalEnd);
    expect(totalBody).not.toContain("fontStyle:'italic'");
    expect(totalBody).toContain('fontWeight:500');
  });

  it('sub rows have white/transparent background (not sand)', async () => {
    const fs = await import('fs');
    const src = ['../views/Reports/TrialBalance.jsx','../views/Reports/ProfitAndLoss.jsx','../views/Reports/BalanceSheet.jsx','../views/Reports/PayeeReport.jsx','../views/Reports/DrillPanel.jsx'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    const stRowStart = src.indexOf('function StRow(');
    const stRowEnd   = src.indexOf('\nfunction StGroupTotal', stRowStart);
    const stRowBody  = src.slice(stRowStart, stRowEnd);
    expect(stRowBody).not.toContain("background:sub?'var(--sand)'");
  });
});

// ── Transactions checkbox alignment ──────────────────────────────────────────
describe('Transactions — select-all checkbox alignment', () => {
  it('header th has checkbox for select-all', async () => {
    const fs = await import('fs');
    const src = ['../views/Banking/Transactions/index.jsx','../views/Banking/Transactions/TransactionFilters.jsx','../views/Banking/Transactions/TransactionRow.jsx','../views/Banking/Transactions/InlineCatPicker.jsx','../views/Banking/Transactions/InlinePayeePicker.jsx','../views/Banking/Transactions/InlineDescEditor.jsx','../views/Banking/Transactions/DeleteToast.jsx','../views/Banking/Transactions/MakeRulePrompt.jsx','../views/Banking/Transactions/transactionHelpers.js'].map(p=>fs.readFileSync(new URL(p,import.meta.url),'utf-8')).join('\n');
    const theadIdx = src.indexOf('<thead>');
    const theadBlock = src.slice(theadIdx, theadIdx + 500);
    expect(theadBlock).toContain('type="checkbox"');
    // width check relaxed — colgroup now handles column width
    expect(theadBlock).toContain('type="checkbox"');
  });
});
