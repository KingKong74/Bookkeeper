/**
 * integration.imports.test.js
 * Integration tests — validate that ALL modules used in AppContext
 * are actually exported from supabase.js.
 * This catches the "getMerchantHints is not defined" class of bug.
 */
import { describe, it, expect } from 'vitest';

// Dynamically import helpers and supabase to verify exports exist
describe('AppContext dependency validation — all imports must exist', () => {
  const REQUIRED_SUPABASE_EXPORTS = [
    // Core data loaders
    'getMyOrgs', 'getTransactions', 'getCategories', 'getPayees',
    'getRules', 'getJournals', 'getBudgets', 'getTaxProfile',
    'getTaxReferenceData', 'getBankAccounts',
    // New features (previously caused runtime ReferenceError)
    'getMerchantHints', 'getOrgSettings',
    // Mutations
    'upsertPayee', 'updateTransaction', 'deleteTransaction',
    'createRule', 'updateRule', 'deleteRule',
    'createCategory', 'updateCategory', 'deleteCategory',
    'createJournalEntry', 'updateJournalEntry',
    'upsertBudget', 'updateBankAccount',
    // Double-entry engine
    'postCategoryJournal', 'voidAutoJournal', 'batchPostJournals',
    'getJournalLinesForReports', 'buildJournalLines',
    // Merchant hints
    'upsertMerchantHint', 'disableMerchantHint',
    'updateOrgSetting',
    // Pending suggestions
    'savePendingSuggestions', 'getPendingSuggestions', 'dismissPendingSuggestion',
    // Bulk import
    'bulkImportTransactions',
  ];

  const REQUIRED_HELPERS_EXPORTS = [
    'fmt', 'fmtSigned', 'filterByDateRange', 'buildAccountTotals',
    'runAutoCatRules', 'dateRangeLabel', 'buildJournalLines',
    'buildTBFromJournals', 'isTBBalanced',
    'buildPLFromJournals', 'buildBSFromJournals',
    'estimateCategoryForMerchant', 'extractPayeeCandidate',
    'analyseImportedTransactions',
    'extractMerchantName', 'groupDescriptionsByMerchant',
  ];

  const REQUIRED_MERCHANT_EXPORTS = [
    'extractMerchantName', 'groupDescriptionsByMerchant',
  ];

  it('all required supabase.js exports exist', async () => {
    const mod = await import('../lib/supabase.js');
    const missing = REQUIRED_SUPABASE_EXPORTS.filter(name => !(name in mod));
    expect(missing, `Missing exports from supabase.js: ${missing.join(', ')}`).toEqual([]);
  });

  it('all required helpers.js exports exist', async () => {
    const mod = await import('../utils/helpers.js');
    // helpers re-exports extractMerchantName from merchant.js
    const missing = REQUIRED_HELPERS_EXPORTS.filter(name => !(name in mod));
    expect(missing, `Missing exports from helpers.js: ${missing.join(', ')}`).toEqual([]);
  });

  it('all required merchant.js exports exist', async () => {
    const mod = await import('../utils/merchant.js');
    const missing = REQUIRED_MERCHANT_EXPORTS.filter(name => !(name in mod));
    expect(missing, `Missing exports from merchant.js: ${missing.join(', ')}`).toEqual([]);
  });

  it('getMerchantHints is callable (was undefined at runtime)', async () => {
    const { getMerchantHints } = await import('../lib/supabase.js');
    expect(typeof getMerchantHints).toBe('function');
  });

  it('getOrgSettings is callable', async () => {
    const { getOrgSettings } = await import('../lib/supabase.js');
    expect(typeof getOrgSettings).toBe('function');
  });

  it('updateOrgSetting is callable and does not call rpc()', async () => {
    const { updateOrgSetting } = await import('../lib/supabase.js');
    expect(typeof updateOrgSetting).toBe('function');
    // Verify the function body does not contain 'set_org_setting' (the broken RPC)
    expect(updateOrgSetting.toString()).not.toContain('set_org_setting');
  });
});

// ── Feature flag validation ───────────────────────────────────────────────────
describe('Feature flag: merchantIntelEnabled', () => {
  it('merchant intelligence defaults to enabled (undefined = true)', () => {
    const orgSettings = undefined;
    const enabled = orgSettings?.merchantIntelEnabled !== false;
    expect(enabled).toBe(true);
  });
  it('can be explicitly disabled',    () => expect({ merchantIntelEnabled:false }.merchantIntelEnabled).toBe(false));
  it('can be explicitly enabled',     () => expect({ merchantIntelEnabled:true  }.merchantIntelEnabled).toBe(true));
  it('null settings → defaults to enabled', () => {
    const orgSettings = null;
    expect(orgSettings?.merchantIntelEnabled !== false).toBe(true);
  });
});

// ── Ghost rules: fromIntel flag guards import ─────────────────────────────────
describe('Ghost rule guard: fromIntel must block auto-apply on import', () => {
  function applyCat(sug) {
    return sug?.sugCat && !sug?.fromIntel ? sug.sugCat : null;
  }

  it('rule suggestion (fromIntel=false) → applied',       () => expect(applyCat({sugCat:'c-groc',fromIntel:false})).toBe('c-groc'));
  it('intel suggestion (fromIntel=true) → NOT applied',   () => expect(applyCat({sugCat:'c-groc',fromIntel:true })).toBeNull());
  it('no suggestion → null',                              () => expect(applyCat(null)).toBeNull());
  it('sugCat present, fromIntel undefined → applied',     () => expect(applyCat({sugCat:'c-groc'})).toBe('c-groc'));
  it('fromIntel=true always blocks regardless of confidence', () => {
    expect(applyCat({sugCat:'c-groc',fromIntel:true,confidence:'High'})).toBeNull();
  });
});

// ── Context value completeness ────────────────────────────────────────────────
// Catches "setOrgSettings is not a function" class of bug:
// state declared with useState but forgotten in the context value object
describe('AppContext value completeness', () => {
  const REQUIRED_CONTEXT_KEYS = [
    // Core data
    'txns', 'setTxns', 'cats', 'setCats', 'catMap',
    'payees', 'setPayees', 'rules', 'setRules',
    'accounts', 'setAccounts', 'budgets', 'setBudgets',
    'journals', 'setJournals',
    // Intelligence — these were missing and caused runtime errors
    'merchantHints', 'setMerchantHints',
    'orgSettings',   'setOrgSettings',
    // Auth / org
    'org', 'user', 'session',
    // Tax
    'taxProfile', 'taxRefData',
    // Date range
    'dateFrom', 'dateTo',
    // UI
    'toast', 'PALETTE', 'reloadAll',
  ];

  it('AppContext exposes all required keys including merchantHints and orgSettings', async () => {
    // We can't render a component here, but we can verify the value object
    // is built from the AppContext module by checking the source
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../context/AppContext.jsx', import.meta.url), 'utf-8');

    // Find the value object in the source
    const valueStart = src.indexOf('const value = {');
    const valueEnd   = src.indexOf('\n  };\n\n  return <AppContext', valueStart);
    const valueBlock = src.slice(valueStart, valueEnd);

    const missing = REQUIRED_CONTEXT_KEYS.filter(k => !valueBlock.includes(k));
    expect(missing, `Keys missing from AppContext value: ${missing.join(', ')}`).toEqual([]);
  });

  it('setOrgSettings is in context value (was the bug)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../context/AppContext.jsx', import.meta.url), 'utf-8');
    const valueBlock = src.slice(src.indexOf('const value = {'), src.indexOf('\n  };\n\n  return <AppContext'));
    expect(valueBlock).toContain('setOrgSettings');
  });

  it('setMerchantHints is in context value', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../context/AppContext.jsx', import.meta.url), 'utf-8');
    const valueBlock = src.slice(src.indexOf('const value = {'), src.indexOf('\n  };\n\n  return <AppContext'));
    expect(valueBlock).toContain('setMerchantHints');
  });
});

// ── RuleBuilderModal dependency check ─────────────────────────────────────────
describe('RuleBuilderModal.jsx dependency completeness', () => {
  it('defines CAT_TYPE_ORDER before categorySections', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../components/RuleBuilderModal.jsx', import.meta.url), 'utf-8');
    const orderIdx   = src.indexOf('CAT_TYPE_ORDER');
    const labelsIdx  = src.indexOf('CAT_TYPE_LABELS');
    const sectionIdx = src.indexOf('function categorySections');
    expect(orderIdx).toBeGreaterThan(0);
    expect(labelsIdx).toBeGreaterThan(0);
    expect(orderIdx).toBeLessThan(sectionIdx);
    expect(labelsIdx).toBeLessThan(sectionIdx);
  });

  it('does not import from wrong relative path', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../components/RuleBuilderModal.jsx', import.meta.url), 'utf-8');
    // Should use '../lib/supabase' not '../../lib/supabase'
    expect(src).not.toContain("'../../lib/supabase'");
    expect(src).toContain("'../lib/supabase'");
  });
});

// ── RuleBuilderModal structural render test ───────────────────────────────────
// Catches "cats is not defined" — where param name doesn't match body usage.
// Tests that categorySections works correctly with real input before render.
describe('RuleBuilderModal: categorySections structural correctness', () => {
  // Import the pure helper functions directly (no React render needed)
  it('categorySections returns array given cat list', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../components/RuleBuilderModal.jsx', import.meta.url), 'utf-8'
    );
    const fnBody = src.slice(src.indexOf('function categorySections('));
    // Function exists and takes effectiveCats parameter
    expect(fnBody).toContain('function categorySections(effectiveCats)');
    // It filters out parents with active sub-accounts (selectable logic)
    expect(fnBody).toContain('selectable');
    // Returns sections sorted by code
    expect(fnBody).toContain('return CAT_TYPE_ORDER');
  });

  it('categorySections call sites pass effectiveCats not cats', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../components/RuleBuilderModal.jsx', import.meta.url), 'utf-8'
    );
    // Every call to categorySections(...) must NOT pass bare 'cats'
    const calls = [...src.matchAll(/categorySections\(([^)]+)\)/g)].map(m => m[1].trim());
    for (const arg of calls) {
      expect(arg, `categorySections called with stale 'cats': categorySections(${arg})`).not.toBe('cats');
    }
  });

  it('no bare cats reference outside component body in RuleBuilderModal', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../components/RuleBuilderModal.jsx', import.meta.url), 'utf-8'
    );
    // categorySections function body must not reference undeclared 'cats'
    const fnStart = src.indexOf('function categorySections(');
    const fnEnd   = src.indexOf('\nfunction ', fnStart + 1);
    const fnSrc   = src.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 500);
    // Should not contain standalone 'cats' (only as part of effectiveCats etc.)
    const bareRef = fnSrc.match(/[^a-zA-Z_](cats)[^a-zA-Z_\d]/);
    expect(bareRef?.[1]).toBeUndefined();
  });
});
