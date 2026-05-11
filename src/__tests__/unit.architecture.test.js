/**
 * unit.architecture.test.js
 * Tests that enforce architectural rules across the codebase.
 * These tests act as a linter for code structure — they fail
 * when a developer accidentally breaks a separation-of-concerns rule.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'fs';
import { promisify } from 'util';

function readSrc(rel) {
  return fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf-8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(process.cwd(), 'src', rel));
}

// ── Required files exist ───────────────────────────────────────────────────────
describe('required files exist', () => {
  const required = [
    'services/transactionService.js',
    'services/journalService.js',
    'services/categoryService.js',
    'services/bankService.js',
    'services/authService.js',
    'services/reportService.js',
    'utils/currency.js',
    'utils/dates.js',
    'utils/journalMath.js',
    'hooks/useTransactions.js',
    'hooks/useTheme.js',
    'hooks/useCollapsible.js',
    'hooks/useAuth.js',
    'hooks/useOrganisation.js',
  ];
  for (const file of required) {
    it(`${file} exists`, () => {
      expect(fileExists(file)).toBe(true);
    });
  }
});

// ── Naming conventions ────────────────────────────────────────────────────────
describe('naming conventions', () => {
  it('hook files start with "use"', () => {
    const hooks = fs.readdirSync(path.join(process.cwd(), 'src', 'hooks'));
    for (const file of hooks.filter(f => f.endsWith('.js'))) {
      expect(file).toMatch(/^use[A-Z]/);
    }
  });

  it('service files end with "Service"', () => {
    const services = fs.readdirSync(path.join(process.cwd(), 'src', 'services'));
    for (const file of services.filter(f => f.endsWith('.js'))) {
      expect(file).toMatch(/Service\.js$/);
    }
  });
});

// ── No supabase in utils ──────────────────────────────────────────────────────
describe('utils purity — no external dependencies', () => {
  const utilFiles = fs.readdirSync(path.join(process.cwd(), 'src', 'utils'))
    .filter(f => f.endsWith('.js') && !f.includes('test'));

  for (const file of utilFiles) {
    if (['helpers.js', 'taxEngine.js', 'csvParser.js', 'pdfParser.js', 'merchant.js'].includes(file)) continue;
    it(`utils/${file} has no supabase dependency`, () => {
      const src = readSrc(`utils/${file}`);
      expect(src).not.toContain("from '../lib/supabase'");
      expect(src).not.toContain("supabase");
    });
  }
});

// ── Services have no React imports ────────────────────────────────────────────
describe('services purity — no React/UI dependencies', () => {
  const serviceFiles = fs.readdirSync(path.join(process.cwd(), 'src', 'services'))
    .filter(f => f.endsWith('.js'));

  for (const file of serviceFiles) {
    it(`services/${file} has no React import`, () => {
      const src = readSrc(`services/${file}`);
      expect(src).not.toContain("import React");
      expect(src).not.toContain("from 'react'");
    });
    it(`services/${file} has no JSX`, () => {
      const src = readSrc(`services/${file}`);
      expect(src).not.toContain('<div');
      expect(src).not.toContain('className=');
    });
  }
});

// ── Comment quality — WHY not WHAT ───────────────────────────────────────────
describe('comment quality', () => {
  it('journalMath.js has explanatory comments (why, not what)', () => {
    const src = readSrc('utils/journalMath.js');
    // Should have block comments explaining business rules
    expect(src).toContain('Double-entry');
    expect(src).toContain('DR');
    expect(src).toContain('CR');
  });

  it('journalService.js explains the reversal pattern', () => {
    const src = readSrc('services/journalService.js');
    expect(src).toContain('reversed');
  });
});

// ── Sidebar collapse is implemented ──────────────────────────────────────────
describe('sidebar — collapse feature', () => {
  it('Sidebar has collapsed state', () => {
    const src = readSrc('components/layout/Sidebar.jsx');
    expect(src).toContain('collapsed');
    expect(src).toContain('sb--collapsed');
  });
  it('Sidebar persists collapsed state to localStorage', () => {
    const src = readSrc('components/layout/Sidebar.jsx');
    expect(src).toContain("localStorage.setItem('sb_collapsed'");
  });
  it('CSS has sb--collapsed class', () => {
    // CSS is now split — check sidebar.css (or main.css as import entry point)
    const sbCss = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'sidebar.css'), 'utf-8');
    expect(sbCss).toContain('.sb--collapsed');
  });
  it('CSS sidebar has width transition for smooth collapse', () => {
    const sbCss = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'sidebar.css'), 'utf-8');
    const sidebarSectionIdx = sbCss.indexOf('4. SIDEBAR');
    const sbBlock = sbCss.slice(sidebarSectionIdx, sidebarSectionIdx + 800);
    expect(sbBlock).toContain('transition');
    expect(sbBlock).toContain('width 0');
  });
  it('CSS has responsive media query for narrow screens', () => {
    const sbCss = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'sidebar.css'), 'utf-8');
    expect(sbCss).toContain('@media (max-width: 720px)');
  });
});

// ── README exists and is comprehensive ───────────────────────────────────────
describe('README completeness', () => {
  it('README.md exists at project root', () => {
    const exists = fs.existsSync(path.join(process.cwd(), 'README.md'));
    expect(exists).toBe(true);
  });
  it('README covers architecture', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');
    expect(src).toContain('Architecture');
    expect(src).toContain('services/');
    expect(src).toContain('utils/');
    expect(src).toContain('hooks/');
  });
  it('README covers deployment', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');
    expect(src).toContain('Deployment');
    expect(src).toContain('Netlify');
  });
  it('README has testing section', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');
    expect(src).toContain('Testing');
    expect(src).toContain('npm test');
  });
});

// ── CSS split architecture ────────────────────────────────────────────────────
describe('CSS split — all modules exist and have content', () => {
  const modules = ['tokens.css', 'dark.css', 'sidebar.css', 'layout.css', 'components.css', 'views.css'];
  modules.forEach(mod => {
    it(`${mod} exists with content`, () => {
      const p = path.join(process.cwd(), 'src', 'styles', mod);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(50);
    });
  });
  it('main.css imports all modules', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'main.css'), 'utf-8');
    modules.forEach(mod => expect(css).toContain(mod));
  });
});

// ── Sidebar flip animation ────────────────────────────────────────────────────
describe('sidebar logo flip animation', () => {
  it('has flip-out and flip-in CSS classes', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'sidebar.css'), 'utf-8');
    expect(css).toContain('sb-logo-btn--flip-out');
    expect(css).toContain('sb-logo-btn--flip-in');
  });
  it('has @keyframes for both flip directions', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'sidebar.css'), 'utf-8');
    expect(css).toContain('@keyframes sb-flip-out');
    expect(css).toContain('@keyframes sb-flip-in');
    expect(css).toContain('rotateY');
  });
  it('Sidebar component triggers flip on theme toggle', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'components/layout/Sidebar.jsx'), 'utf-8');
    expect(src).toContain('flipPhase');
    expect(src).toContain("'out'");
    expect(src).toContain("'in'");
    expect(src).toContain('sb-logo-btn--flip');
  });
  it('Sidebar logo is small and sized via CSS class not inline', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'components/layout/Sidebar.jsx'), 'utf-8');
    expect(src).toContain('className="sb-logo"');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'sidebar.css'), 'utf-8');
    // Logo should be 22px, not 28px (original was too big)
    expect(css).toContain('.sb-logo { width: 22px; height: 22px');
  });
});

// ── Dark mode — variable coverage ────────────────────────────────────────────
describe('dark mode CSS coverage', () => {
  it('dark.css defines all core CSS variables', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'dark.css'), 'utf-8');
    ['--sand', '--ink', '--a:', '--gn:', '--rd:', '--bd:', '--bg-card'].forEach(v =>
      expect(css).toContain(v)
    );
  });
  it('dark.css overrides vp and vn colors', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'dark.css'), 'utf-8');
    expect(css).toContain('.vp');
    expect(css).toContain('.vn');
  });
  it('tokens.css has :root with bg-card', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf-8');
    expect(css).toContain(':root');
    expect(css).toContain('--bg-card');
  });
  it('no hardcoded #FDFAF6 left in JSX source files', () => {
    const files = require('fs').readdirSync(path.join(process.cwd(), 'src'), { recursive: true });
    // Check key files
    const toCheck = ['views/Banking/Transactions/InlineCatPicker.jsx',
                     'views/Banking/Transactions/InlinePayeePicker.jsx',
                     'views/Banking/BankAccounts.jsx'];
    toCheck.forEach(f => {
      const p = path.join(process.cwd(), 'src', f);
      if (fs.existsSync(p)) {
        expect(fs.readFileSync(p, 'utf-8')).not.toContain('#FDFAF6');
      }
    });
  });
});

// ── Pending import flow ───────────────────────────────────────────────────────
describe('pending_import — transaction staging', () => {
  it('transactionService filters pending_import with fallback', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'services/transactionService.js'), 'utf-8');
    expect(src).toContain('pending_import');
    expect(src).toContain('usePendingFilter');
    // fallback: if column missing, retry without filter
    expect(src).toContain('continue');
  });
  it('BankAccounts passes id through to parsedFiles', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'views/Banking/BankAccounts.jsx'), 'utf-8');
    expect(src).toContain('id: t.id');
  });
  it('ImportStatement doImport detects bank_feed type', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'views/Banking/ImportStatement/index.jsx'), 'utf-8');
    expect(src).toContain('isBankFeed');
    expect(src).toContain('bank_feed');
    expect(src).toContain('pending_import: false');
  });
});

// ── Balance Sheet always shows bank accounts ─────────────────────────────────
describe('BalanceSheet — bank accounts always visible', () => {
  it('bankAccounts calc uses same txns as BankAccounts view for consistency', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'views/Reports/BalanceSheet.jsx'), 'utf-8');
    // allTxns = txns (context) — matches BankAccounts.jsx formula exactly
    // Previously fetched all-time txns which caused double-counting with Basiq ob
    expect(src).toContain('allTxns = txns');
    expect(src).toContain('account_id === a.id');
  });
  it('renders bank accounts without requiring hasJournals', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'views/Reports/BalanceSheet.jsx'), 'utf-8');
    // liquidAccounts rendering should not be inside a hasJournals ternary gate
    expect(src).toContain('liquidAccounts.map');
    // Bank accounts always show comment
    expect(src).toContain('always show');
  });
});
