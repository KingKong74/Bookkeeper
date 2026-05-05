/**
 * unit.merchant.test.js
 * Unit tests for merchant.js — extractMerchantName, groupDescriptionsByMerchant.
 * Coverage: extraction logic, noise patterns, stop words, grouping, edge cases, speed.
 */
import { describe, it, expect } from 'vitest';
import { extractMerchantName, groupDescriptionsByMerchant } from '../utils/merchant.js';

// ── extractMerchantName() — Australian bank description formats ───────────────
describe('extractMerchantName() — standard patterns', () => {
  // Slash-separated (common in ANZ)
  it('WOOLWORTHS/543 LUTWYCHE → Woolworths',          () => expect(extractMerchantName('WOOLWORTHS/543 LUTWYCHE R LUTWYCHE')).toBe('Woolworths'));
  it('COLES/1234 SYDNEY → Coles',                     () => expect(extractMerchantName('COLES/1234 SYDNEY')).toBe('Coles'));

  // Payment verb stripping
  it('PAYMENT TO GOODLIFE → Goodlife',                () => expect(extractMerchantName('PAYMENT TO GOODLIFE CARINDA A00LK')).toMatch(/^Goodlife/));
  it('BPAY TO TELSTRA → Telstra',                     () => expect(extractMerchantName('BPAY TO TELSTRA #619288')).toBe('Telstra'));
  it('DIRECT DEBIT ENERGY AUSTRALIA → Energy',        () => expect(extractMerchantName('DIRECT DEBIT ENERGY AUSTRALIA')).toBe('Energy'));
  it('EFTPOS COLES → Coles',                          () => expect(extractMerchantName('EFTPOS COLES SUPERMARKETS SYDNEY')).toBe('Coles'));

  // Domain names
  it('NETFLIX.COM → Netflix',                         () => expect(extractMerchantName('NETFLIX.COM')).toBe('Netflix'));
  it('NETFLIX.COM ANNUAL → Netflix',                  () => expect(extractMerchantName('NETFLIX.COM ANNUAL')).toBe('Netflix'));
  it('SPOTIFY.COM SUBSCRIPTION → Spotify',            () => expect(extractMerchantName('SPOTIFY.COM SUBSCRIPTION')).toBe('Spotify'));

  // Ref codes
  it('strips trailing hash codes',                    () => expect(extractMerchantName('PAYMENT TO COINSPOT #017452')).toBe('Coinspot'));
  it('strips alphanumeric reference codes',           () => expect(extractMerchantName('PAYMENT TO BETASHARES APPLICATIONS #191841')).toMatch(/^Betashares/));

  // Title casing
  it('title-cases the result',                        () => { const r=extractMerchantName('WOOLWORTHS METRO'); expect(r).toBe(r?.charAt(0).toUpperCase()+r?.slice(1)); });

  // Stop words
  it('stops at SUPERMARKETS stop word',               () => expect(extractMerchantName('WOOLWORTHS SUPERMARKETS SYDNEY')).toBe('Woolworths'));
  it('stops at QLD location word',                    () => expect(extractMerchantName('JB HI-FI QLD')).toMatch(/^Jb/));
});

describe('extractMerchantName() — internal/non-merchant', () => {
  it('SALARY CREDIT → null',                          () => expect(extractMerchantName('SALARY CREDIT COMPANY PTY LTD')).toBeNull());
  it('CREDIT INTEREST → null',                        () => expect(extractMerchantName('CREDIT INTEREST')).toBeNull());
  it('ATM WITHDRAWAL → null',                         () => expect(extractMerchantName('ATM WITHDRAWAL 0123')).toBeNull());
  it('INTERNET BANKING TRANSFER → null',              () => expect(extractMerchantName('INTERNET BANKING TRANSFER')).toBeNull());
});

describe('extractMerchantName() — edge cases', () => {
  it('null input → null',                             () => expect(extractMerchantName(null)).toBeNull());
  it('empty string → null',                           () => expect(extractMerchantName('')).toBeNull());
  it('whitespace only → null',                        () => expect(extractMerchantName('   ')).toBeNull());
  it('single letter → null',                          () => expect(extractMerchantName('A')).toBeNull());
  it('pure numbers → null',                           () => expect(extractMerchantName('12345')).toBeNull());
  it('does not throw on any input',                   () => {
    const inputs=['','   ',null,undefined,'!!!','123-456','A/B/C'];
    inputs.forEach(i => expect(()=>extractMerchantName(i)).not.toThrow());
  });

  // Speed: 500 extractions in < 50ms
  it('extracts 500 merchant names in < 50ms', () => {
    const descs=['WOOLWORTHS/543 LUTWYCHE','PAYMENT TO GOODLIFE CARINDA A001','NETFLIX.COM ANNUAL','BPAY TO TELSTRA #619','SALARY CREDIT EMPLOYER'];
    const start=Date.now();
    for (let i=0; i<500; i++) extractMerchantName(descs[i%descs.length]);
    expect(Date.now()-start).toBeLessThan(50);
  });
});

// ── groupDescriptionsByMerchant() ─────────────────────────────────────────────
describe('groupDescriptionsByMerchant()', () => {
  const txns = [
    { id:'t1', desc:'WOOLWORTHS/543 LUTWYCHE', amt:-92 },
    { id:'t2', desc:'WOOLWORTHS ONLINE 9182',  amt:-55 },
    { id:'t3', desc:'PAYMENT TO GOODLIFE CARINDA A001', amt:-17.49 },
    { id:'t4', desc:'PAYMENT TO GOODLIFE CARINDA A002', amt:-17.49 },
    { id:'t5', desc:'NETFLIX.COM',              amt:-15.99 },
    { id:'t6', desc:'NETFLIX.COM ANNUAL',       amt:-15.99 },
    { id:'t7', desc:'SALARY CREDIT EMPLOYER',   amt:5000 },  // internal → excluded
    { id:'t8', desc:'UNIQUE ONE OFF PURCHASE',  amt:-200 },  // single → not grouped
  ];

  const groups = groupDescriptionsByMerchant(txns);

  it('returns array',                             () => expect(Array.isArray(groups)).toBe(true));
  it('only includes merchants with count >= 2',   () => groups.forEach(g => expect(g.count).toBeGreaterThanOrEqual(2)));
  it('Woolworths appears (count 2)',              () => expect(groups.find(g=>g.name==='Woolworths')?.count).toBe(2));
  it('Goodlife appears (count 2)',                () => expect(groups.find(g=>g.name?.startsWith('Goodlife'))?.count).toBe(2));
  it('Netflix appears (count 2)',                 () => expect(groups.find(g=>g.name==='Netflix')?.count).toBe(2));
  it('SALARY CREDIT excluded (internal)',         () => expect(groups.find(g=>g.name?.toLowerCase().includes('salary'))).toBeUndefined());
  it('one-off purchase not in groups',            () => expect(groups.find(g=>g.name==='Unique')).toBeUndefined());
  it('sorted by count descending',               () => {
    for (let i=1;i<groups.length;i++) expect(groups[i-1].count).toBeGreaterThanOrEqual(groups[i].count);
  });
  it('amounts array is populated',               () => {
    const g=groups.find(g=>g.name?.startsWith('Goodlife'));
    expect(g?.amounts?.length).toBe(2);
  });
  it('keyword is lowercase',                     () => groups.forEach(g => expect(g.keyword).toBe(g.keyword?.toLowerCase())));
  it('empty array returns empty',                () => expect(groupDescriptionsByMerchant([])).toEqual([]));
  it('truly unique merchants → not grouped',     () => {
    const singles=[{id:'a',desc:'PAYMENT TO UNIQUE MERCHANT A001',amt:-1},{id:'b',desc:'PAYMENT TO DIFFERENT MERCHANT B002',amt:-2}];
    const g=groupDescriptionsByMerchant(singles);
    // Each appears once, so none should be grouped
    g.forEach(grp=>expect(grp.count).toBeGreaterThanOrEqual(2));
  });
});
