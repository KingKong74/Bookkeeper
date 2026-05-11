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
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'main.css'), 'utf-8');
    expect(css).toContain('.sb--collapsed');
  });
  it('CSS sidebar has width transition for smooth collapse', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'main.css'), 'utf-8');
    // Find the main sidebar section, not the dark mode override
    const sidebarSectionIdx = css.indexOf('4. SIDEBAR');
    const sbBlock = css.slice(sidebarSectionIdx, sidebarSectionIdx + 800);
    expect(sbBlock).toContain('transition');
    expect(sbBlock).toContain('width 0');
  });
  it('CSS has responsive media query for narrow screens', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'main.css'), 'utf-8');
    expect(css).toContain('@media (max-width: 720px)');
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
