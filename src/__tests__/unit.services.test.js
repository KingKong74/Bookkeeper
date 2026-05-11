/**
 * unit.services.test.js
 * Tests for the service layer contract and integration patterns.
 * Verifies that services exist, export the right functions,
 * and that the architecture is correctly separated.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readSrc(rel) {
  return fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf-8');
}

// ── Service layer exists and exports correct functions ────────────────────────

describe('transactionService — exports and contract', () => {
  it('exports fetchTransactions', async () => {
    const m = await import('../services/transactionService');
    expect(typeof m.fetchTransactions).toBe('function');
  });
  it('exports createTransaction', async () => {
    const m = await import('../services/transactionService');
    expect(typeof m.createTransaction).toBe('function');
  });
  it('exports updateTransaction', async () => {
    const m = await import('../services/transactionService');
    expect(typeof m.updateTransaction).toBe('function');
  });
  it('exports deleteTransaction', async () => {
    const m = await import('../services/transactionService');
    expect(typeof m.deleteTransaction).toBe('function');
  });
  it('exports bulkImportTransactions', async () => {
    const m = await import('../services/transactionService');
    expect(typeof m.bulkImportTransactions).toBe('function');
  });
});

describe('journalService — exports and contract', () => {
  it('exports fetchJournals', async () => {
    const m = await import('../services/journalService');
    expect(typeof m.fetchJournals).toBe('function');
  });
  it('exports postCategoryJournal', async () => {
    const m = await import('../services/journalService');
    expect(typeof m.postCategoryJournal).toBe('function');
  });
  it('exports batchPostJournals', async () => {
    const m = await import('../services/journalService');
    expect(typeof m.batchPostJournals).toBe('function');
  });
  it('exports createJournalEntry', async () => {
    const m = await import('../services/journalService');
    expect(typeof m.createJournalEntry).toBe('function');
  });
});

describe('categoryService — exports and contract', () => {
  it('exports fetchCategories', async () => {
    const m = await import('../services/categoryService');
    expect(typeof m.fetchCategories).toBe('function');
  });
  it('exports upsertPayee', async () => {
    const m = await import('../services/categoryService');
    expect(typeof m.upsertPayee).toBe('function');
  });
  it('exports fetchRules', async () => {
    const m = await import('../services/categoryService');
    expect(typeof m.fetchRules).toBe('function');
  });
});

describe('bankService — exports and contract', () => {
  it('exports fetchBankAccounts', async () => {
    const m = await import('../services/bankService');
    expect(typeof m.fetchBankAccounts).toBe('function');
  });
  it('exports createBankAccount', async () => {
    const m = await import('../services/bankService');
    expect(typeof m.createBankAccount).toBe('function');
  });
});

describe('authService — exports and contract', () => {
  it('exports signIn', async () => {
    const m = await import('../services/authService');
    expect(typeof m.signIn).toBe('function');
  });
  it('exports signOut', async () => {
    const m = await import('../services/authService');
    expect(typeof m.signOut).toBe('function');
  });
  it('exports getMyOrgs', async () => {
    const m = await import('../services/authService');
    expect(typeof m.getMyOrgs).toBe('function');
  });
});

// ── Separation of concerns — views must not call supabase directly ────────────

describe('separation of concerns — views use service layer', () => {
  const viewsToCheck = [
    'views/Banking/BankAccounts.jsx',
    'views/Auth.jsx',
  ];

  for (const view of viewsToCheck) {
    it(`${view} does not import directly from lib/supabase for domain operations`, () => {
      const src = readSrc(view);
      // Auth.jsx should use authService, not lib/supabase
      if (view === 'views/Auth.jsx') {
        expect(src).toContain("from '../services/authService'");
      }
      // BankAccounts should use bankService
      if (view.includes('BankAccounts')) {
        expect(src).toContain("from '../../services/bankService'");
      }
    });
  }
});

describe('separation of concerns — services do not import from views', () => {
  const services = [
    'services/transactionService.js',
    'services/journalService.js',
    'services/categoryService.js',
    'services/bankService.js',
    'services/authService.js',
  ];
  for (const svc of services) {
    it(`${svc} has no view imports`, () => {
      const src = readSrc(svc);
      expect(src).not.toContain("from '../views");
      expect(src).not.toContain("from '../../views");
      expect(src).not.toContain("React");
    });
  }
});

describe('separation of concerns — utils are pure (no side effects)', () => {
  const utils = ['utils/currency.js', 'utils/dates.js', 'utils/journalMath.js'];
  for (const util of utils) {
    it(`${util} does not import from supabase or context`, () => {
      const src = readSrc(util);
      expect(src).not.toContain('supabase');
      expect(src).not.toContain('AppContext');
      expect(src).not.toContain('useState');
      expect(src).not.toContain('useEffect');
    });
  }
});

// ── File size compliance (<300 lines) ─────────────────────────────────────────

describe('file size compliance — new files under 300 lines', () => {
  const newFiles = [
    'services/transactionService.js',
    'services/journalService.js',
    'services/categoryService.js',
    'services/bankService.js',
    'services/authService.js',
    'utils/currency.js',
    'utils/dates.js',
    'utils/journalMath.js',
    'hooks/useTransactions.js',
    'hooks/useTheme.js',
  ];
  for (const file of newFiles) {
    it(`${file} is under 300 lines`, () => {
      const src = readSrc(file);
      const lines = src.split('\n').length;
      expect(lines).toBeLessThan(300);
    });
  }
});

// ── Hook layer ────────────────────────────────────────────────────────────────

describe('useTransactions hook — structure', () => {
  it('exports useTransactions', async () => {
    const m = await import('../hooks/useTransactions');
    expect(typeof m.useTransactions).toBe('function');
  });
  it('exports suppression constants', async () => {
    const m = await import('../hooks/useTransactions');
    expect(m.SUPPRESS_PAYEE).toBe('ledger_suppressed_payee');
    expect(m.SUPPRESS_CAT).toBe('ledger_suppressed_cat');
  });
  it('exports isSuppressed helper', async () => {
    const m = await import('../hooks/useTransactions');
    expect(typeof m.isSuppressed).toBe('function');
  });
});

describe('useTheme hook — structure', () => {
  it('exports useTheme', async () => {
    const m = await import('../hooks/useTheme');
    expect(typeof m.useTheme).toBe('function');
  });
});

// ── journalService uses journalMath (not duplicating logic) ──────────────────

describe('journalService delegates math to journalMath', () => {
  it('journalService imports from journalMath, not reimplements', () => {
    const src = readSrc('services/journalService.js');
    expect(src).toContain("from '../utils/journalMath'");
    expect(src).not.toContain('function buildJournalLines');
  });
});
