/**
 * Feature smoke tests
 * Run: npx vitest run
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src  = (...p) => resolve(__dirname, '..', ...p);
const read = (...p) => readFileSync(src(...p), 'utf8');
const has  = (filePath, str) => read(...filePath).includes(str);

describe('Transactions', () => {
  const f = ['views/Banking/Transactions.jsx'];
  it('account tabs',           () => expect(has(f,'accountTab')).toBe(true));
  it('unlinked tab',           () => expect(has(f,'unlinked')).toBe(true));
  it('bulk allocate',          () => expect(has(f,'bulkAllocate')).toBe(true));
  it('shift+click',            () => expect(has(f,'shiftKey')).toBe(true));
  it('ctrl+a',                 () => expect(has(f,'ctrlKey')).toBe(true));
  it('rule prompt',            () => expect(has(f,'MakeRulePrompt')).toBe(true));
  it('inline cat picker',      () => expect(has(f,'InlineCatPicker')).toBe(true));
  it('inline payee picker',    () => expect(has(f,'InlinePayeePicker')).toBe(true));
  it('inline desc editor',     () => expect(has(f,'InlineDescEditor')).toBe(true));
  it('create cat on spot',     () => expect(has(f,'onCreateCat')).toBe(true));
  it('account column',         () => expect(has(f,'accountTab===null')).toBe(true));
  it('reconciliation panel',   () => expect(has(f,'recon.total')).toBe(true));
  it('status column',          () => expect(has(f,"status==='done'")).toBe(true));
  it('toast delete',           () => expect(has(f,'DeleteToast')).toBe(true));
  it('2.5s fade',              () => expect(has(f,'2500')).toBe(true));
  it('amber row bg',           () => expect(has(f,'#FAF3E4')).toBe(true));
});

describe('TransactionModal', () => {
  const f = ['views/Banking/TransactionModal.jsx'];
  it('bank account selector',  () => expect(has(f,'account_id')).toBe(true));
  it('files tab',              () => expect(has(f,"tab === 'files'")).toBe(true));
  it('file upload',            () => expect(has(f,'uploadTransactionFile')).toBe(true));
  it('audit tab',              () => expect(has(f,"tab === 'audit'")).toBe(true));
  it('searchable category',    () => expect(has(f,'SearchSelect')).toBe(true));
  it('payee with add new',     () => expect(has(f,'PayeeField')).toBe(true));
});

describe('ImportStatement', () => {
  const f = ['views/Banking/ImportStatement.jsx'];
  it('account selector',       () => expect(has(f,'selectedAccount')).toBe(true));
  it('PDF parsing',            () => expect(has(f,'parsePDF')).toBe(true));
  it('CSV parsing',            () => expect(has(f,'parseCSVText')).toBe(true));
  it('new payee discovery',    () => expect(has(f,'newPayeesFound')).toBe(true));
  it('multi-file input',       () => expect(has(f,'multiple')).toBe(true));
  it('parsedFiles state',      () => expect(has(f,'parsedFiles')).toBe(true));
  it('per-file section headers',() => expect(has(f,'_fileIdx')).toBe(true));
  it('add more files button',  () => expect(has(f,'Add more files')).toBe(true));
  it('remove individual file', () => expect(has(f,'keysToRemove')).toBe(true));
  it('rule builder modal',     () => expect(has(f,'showRuleBuilder')).toBe(true));
  it('rule builder forms',     () => expect(has(f,'ruleBuilderSeed') || has(f,'ruleBuilderForms')).toBe(true));
  it('review & add rules btn', () => expect(has(f,'Review & add rules')).toBe(true));
  it('saves rules to DB',      () => expect(has(f,'createRule')).toBe(true));
  it('no dynamic imports',     () => expect(has(f,'await import')).toBe(false));
});

describe('BankAccounts', () => {
  const f = ['views/Banking/BankAccounts.jsx'];
  it('drag-drop',              () => expect(has(f,'onDragStart')).toBe(true));
  it('click-to-navigate',      () => expect(has(f,'onNavigate')).toBe(true));
  it('delete unlinks txns',    () => expect(has(f,'setTxns')).toBe(true));
});

describe('pdfParser', () => {
  const f = ['utils/pdfParser.js'];
  it('ANZ CC parser',          () => expect(has(f,'parseANZCC')).toBe(true));
  it('ANZ Plus parser',        () => expect(has(f,'parseANZPlus')).toBe(true));
  it('date token merge',       () => expect(has(f,'mergeRowDateTokens')).toBe(true));
  it('detects anz_plus',       () => expect(has(f,'flex saver')).toBe(true));
});

describe('Journals', () => {
  const f = ['views/Accounting/Journals.jsx'];
  it('post entry',             () => expect(has(f,'postEntry')).toBe(true));
  it('edit journals',          () => expect(has(f,'loadForEdit')).toBe(true));
  it('void journals',          () => expect(has(f,'voidJournal')).toBe(true));
  it('balance check',          () => expect(has(f,'balanced')).toBe(true));
});

describe('ChartOfAccounts', () => {
  const f = ['views/Accounting/ChartOfAccounts.jsx'];
  it('3 COA seeds',            () => expect(has(f,'COA_PERSONAL')).toBe(true));
  it('drill-through',          () => expect(has(f,'drillCat')).toBe(true));
  it('drill edit txns',        () => expect(has(f,'editId')).toBe(true));
  it('delete confirmation',    () => expect(has(f,'deleteTarget')).toBe(true));
  it('sticky toolbar',         () => expect(has(f,"position:'sticky'")).toBe(true));
});

describe('Reports', () => {
  const f = ['views/Reports/index.jsx'];
  it('A4Paper',                () => expect(has(f,'function A4Paper')).toBe(true));
  it('drill panel',            () => expect(has(f,'function DrillPanel')).toBe(true));
  it('compare bar',            () => expect(has(f,'function CompareBar')).toBe(true));
  it('prior period',           () => expect(has(f,'priorPeriod')).toBe(true));
  it('P&L clickable rows',     () => expect(has(f,'setDrill(c)')).toBe(true));
  it('BS CC liabilities',      () => expect(has(f,'credit_card')).toBe(true));
  it('trial balance',          () => expect(has(f,'TrialBalance')).toBe(true));
});

describe('Dashboard', () => {
  const f = ['views/Dashboard.jsx'];
  it('cashflow bars',          () => expect(has(f,'CashflowBars')).toBe(true));
  it('runway meter',           () => expect(has(f,'RunwayMeter')).toBe(true));
  it('projections',            () => expect(has(f,'buildProjections')).toBe(true));
  it('recurring detection',    () => expect(has(f,'recurring')).toBe(true));
});

describe('Settings', () => {
  const f = ['views/Settings/index.jsx'];
  it('settings page',          () => expect(has(f,'function Settings')).toBe(true));
  it('display prefs',          () => expect(has(f,'showCents')).toBe(true));
  it('export CSV',             () => expect(has(f,'exportCSV')).toBe(true));
});

describe('supabase.js', () => {
  const f = ['lib/supabase.js'];
  it('getTransactions',        () => expect(has(f,'getTransactions')).toBe(true));
  it('bulkImportTransactions', () => expect(has(f,'bulkImportTransactions')).toBe(true));
  it('links existing on reimport',() => expect(has(f,'toUpdate')).toBe(true));
  it('getBankAccounts',        () => expect(has(f,'getBankAccounts')).toBe(true));
  it('hard delete bank acct',  () => expect(has(f,"from('bank_accounts')\n    .delete()")).toBe(true));
  it('createJournalEntry',     () => expect(has(f,'createJournalEntry')).toBe(true));
  it('file upload',            () => expect(has(f,'uploadTransactionFile')).toBe(true));
});

describe('ChartOfAccounts - drill edit', () => {
  const f = ['views/Accounting/ChartOfAccounts.jsx'];
  it('setTxns prop passed to DrillPanel',   () => expect(has(f,'setTxns={setTxns}')).toBe(true));
  it('DrillPanel accepts setTxns',          () => expect(has(f,'function DrillPanel({ cat, txns, setTxns')).toBe(true));
  it('saveEdit updates local state',        () => expect(has(f,'setTxns(prev')).toBe(true));
  it('edit inline form present',            () => expect(has(f,'editDesc')).toBe(true));
  it('sticky toolbar shadow',               () => expect(has(f,'boxShadow')).toBe(true));
});

describe('Transactions - opaque inputs', () => {
  const f = ['views/Banking/Transactions.jsx'];
  it('cat input fully opaque',             () => expect(has(f,"background: '#FDFAF6'")).toBe(true));
  it('apply button soft green',            () => expect(has(f,"background:'var(--gnb)'"  )).toBe(true));
  it('smart keyword extraction',           () => expect(has(f,'meaningful')).toBe(true));
});

describe('AutoCatRules', () => {
  const f = ['views/Accounting/index.jsx'];
  it('drag-drop reorder',                  () => expect(has(f,'onDragStart')).toBe(true));
  it('priority badge',                     () => expect(has(f,'#{i+1}')).toBe(true));
  it('drag handle icon',                   () => expect(has(f,'⠿')).toBe(true));
  it('keyword tip in modal',               () => expect(has(f,'full meaningful phrase')).toBe(true));
});

describe('ChartOfAccounts - drag-drop', () => {
  const f = ['views/Accounting/ChartOfAccounts.jsx'];
  it('has drag state ref',             () => expect(has(f,'dragCatRef')).toBe(true));
  it('has onCatDragStart',             () => expect(has(f,'onCatDragStart')).toBe(true));
  it('has onCatDrop',                  () => expect(has(f,'onCatDrop')).toBe(true));
  it('row is draggable',               () => expect(has(f,'draggable')).toBe(true));
  it('persists sort_order on drop',    () => expect(has(f,'sort_order: i')).toBe(true));
});

describe('AutoCatRules - amount conditions', () => {
  const f = ['views/Accounting/index.jsx'];
  it('has amtExact field',             () => expect(has(f,'amtExact')).toBe(true));
  it('has amtMin field',               () => expect(has(f,'amtMin')).toBe(true));
  it('has amtMax field',               () => expect(has(f,'amtMax')).toBe(true));
  it('has direction field',            () => expect(has(f,'direction')).toBe(true));
  it('shows amount badge on row',      () => expect(has(f,'r.amtExact')).toBe(true));
});

describe('runAutoCatRules - amount conditions', () => {
  const f = ['utils/helpers.js'];
  it('checks amtExact',                () => expect(has(f,'amtExact')).toBe(true));
  it('checks amtMin',                  () => expect(has(f,'amtMin')).toBe(true));
  it('checks amtMax',                  () => expect(has(f,'amtMax')).toBe(true));
  it('checks direction in/out',        () => expect(has(f,"direction === 'in'")).toBe(true));
});

describe('AutoCatRules - DB delete', () => {
  const f = ['views/Accounting/index.jsx'];
  it('imports deleteRule',             () => expect(has(f,'deleteRule')).toBe(true));
  it('del calls deleteRule on DB',     () => expect(has(f,'await deleteRule(rule.id)')).toBe(true));
});

describe('Transactions - search inputs opaque', () => {
  const f = ['views/Banking/Transactions.jsx'];
  it('cat search input not transparent',() => {
    const content = require('fs').readFileSync(require('path').resolve(__dirname,'..','views/Banking/Transactions.jsx'),'utf8');
    // Should NOT have transparent background on search inputs inside dropdowns
    const lines = content.split('\n');
    const transparentInDropdown = lines.some((l,i) => 
      l.includes("background:'transparent'") && 
      lines.slice(Math.max(0,i-5),i).some(prev => prev.includes('dd-search') || prev.includes('boxSizing'))
    );
    expect(transparentInDropdown).toBe(false);
  });
  it('pending category uses InlineCatPicker with suggestionCatId', () => expect(has(f,'suggestionCatId')).toBe(true));
  it('pending category has dismiss button',  () => expect(has(f,'Dismiss suggestion')).toBe(true));
});

describe('ImportStatement — loading + redirect', () => {
  const f = ['views/Banking/ImportStatement.jsx'];
  it('loading overlay exists',           () => expect(has(f,'loadingMsg')).toBe(true));
  it('loading spinner animation',        () => expect(has(f,'ledger-spin')).toBe(true));
  it('always redirects after import',    () => expect(has(f,"onNavigate('transactions')")).toBe(true));
  it('no conditional redirect on payees',() => expect(has(f,"newPayeeNames.size === 0")).toBe(false));
  it('skip-rules pending notice',        () => expect(has(f,'pending suggestions')).toBe(true));
  it('no rule cap slice(0,10)',          () => {
    // The slice in the banner pill display (max 5 pills) is cosmetic and OK
    // But analyseImportedTransactions itself should not cap — check helpers
    const hf = ['utils/helpers.js'];
    expect(has(hf,'ruleOpportunities: ruleOpportunities,  // all detected patterns')).toBe(true);
  });
});

describe('Transactions — click-to-edit removed', () => {
  const f = ['views/Banking/Transactions.jsx'];
  it('amount cell has no onClick setDetailId',  () => expect(has(f,"onClick={()=>setDetailId(t.id)}>{t.amt>=0?'+'")).toBe(false));
  it('status cell has no onClick setDetailId',  () => expect(has(f,"cursor:'pointer' }} onClick={()=>setDetailId(t.id)}>")).toBe(false));
  it('TransactionModal still exists for edit',  () => expect(has(f,'TransactionModal')).toBe(true));
});
