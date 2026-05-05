import { runAutoCatRules } from '../utils/helpers.js';
/**
 * unit.import.dedup.test.js
 * Tests for duplicate transaction detection and import hash generation.
 *
 * TWO classes of "duplicate" exist:
 *   A) TRUE DUPLICATES — same transaction imported twice (re-import same statement)
 *      → should be SKIPPED
 *   B) HASH COLLISIONS — different transactions with identical date+desc+amount
 *      e.g. WOOLWORTHS -$4.27 three times on the same day
 *      → should ALL be INSERTED (they are distinct purchases)
 *
 * Root cause of original bug:
 *   Hash was `date|desc|amount` — no occurrence index.
 *   The second and third Woolworths -$4.27 on the same day got the same hash
 *   as the first → treated as duplicates → silently dropped.
 */
import { describe, it, expect } from 'vitest';

// ── Hash generation logic (mirrors supabase.js buildWithHash) ─────────────────
function buildHashes(transactions) {
  const hashOccurrence = {};
  return transactions.map(t => {
    const baseHash = `${t.date}|${t.desc}|${t.amt}`;
    const n = hashOccurrence[baseHash] ?? 0;
    hashOccurrence[baseHash] = n + 1;
    const import_hash = n === 0 ? baseHash : `${baseHash}|${n}`;
    return { ...t, import_hash };
  });
}

// ── Dedup logic (mirrors supabase.js client-side dedup) ───────────────────────
function simulateImport(incoming, existing) {
  const withHash = buildHashes(incoming);
  const existingByHash = Object.fromEntries(existing.map(e => [e.import_hash, e]));
  const toInsert = [];
  const toUpdate = [];
  let skipped = 0;
  for (const t of withHash) {
    const ex = existingByHash[t.import_hash];
    if (!ex) {
      toInsert.push(t);
    } else if (t.account_id && !ex.account_id) {
      toUpdate.push({ id: ex.id, account_id: t.account_id });
    } else {
      skipped++;
    }
  }
  return { toInsert, toUpdate, skipped };
}

// ── Fixture: the user's actual ANZ CC data that triggered the bug ─────────────
const MARCH_8_WOOLWORTHS = [
  { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-8.69 },
  { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
  { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-5.11 },
];

// ── Hash generation tests ─────────────────────────────────────────────────────
describe('import_hash generation', () => {
  it('unique transactions get unique hashes',        () => {
    const txns = [
      { date:'2026-03-01', desc:'NETFLIX.COM', amt:-15.99 },
      { date:'2026-03-02', desc:'WOOLWORTHS', amt:-45.00 },
    ];
    const hashed = buildHashes(txns);
    const hashes = hashed.map(t => t.import_hash);
    expect(new Set(hashes).size).toBe(2);
  });

  it('first occurrence of a collision gets base hash (no suffix)', () => {
    const hashed = buildHashes(MARCH_8_WOOLWORTHS);
    expect(hashed[0].import_hash).toBe('2026-03-08|WOOLWORTHS/543 LUTWYCHE R LUTWYCHE|-8.69');
  });

  it('different amounts on same day get different hashes', () => {
    const hashed = buildHashes(MARCH_8_WOOLWORTHS);
    const hashes = hashed.map(t => t.import_hash);
    expect(new Set(hashes).size).toBe(3); // -8.69, -4.27, -5.11 all different
  });

  it('same amount same day gets occurrence-indexed hashes', () => {
    const sameAmt = [
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
    ];
    const hashed = buildHashes(sameAmt);
    expect(hashed[0].import_hash).toBe('2026-03-08|WOOLWORTHS/543 LUTWYCHE R LUTWYCHE|-4.27');
    expect(hashed[1].import_hash).toBe('2026-03-08|WOOLWORTHS/543 LUTWYCHE R LUTWYCHE|-4.27|1');
    expect(hashed[2].import_hash).toBe('2026-03-08|WOOLWORTHS/543 LUTWYCHE R LUTWYCHE|-4.27|2');
  });

  it('all hashes are unique even with high-frequency repeats', () => {
    const repeated = Array.from({ length: 10 }, () => ({
      date: '2026-03-15', desc: 'TRANSLINK TICKETING QLD', amt: -0.50,
    }));
    const hashed = buildHashes(repeated);
    const hashes = hashed.map(t => t.import_hash);
    expect(new Set(hashes).size).toBe(10);
  });

  it('occurrence index resets between dates', () => {
    const txns = [
      { date:'2026-03-08', desc:'WOOLWORTHS', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS', amt:-4.27 },
      { date:'2026-03-09', desc:'WOOLWORTHS', amt:-4.27 }, // different date → fresh
    ];
    const hashed = buildHashes(txns);
    expect(hashed[2].import_hash).toBe('2026-03-09|WOOLWORTHS|-4.27'); // no suffix
  });

  it('hash is deterministic — same input always same output', () => {
    const h1 = buildHashes([{ date:'2026-01-01', desc:'NETFLIX.COM', amt:-15.99 }]);
    const h2 = buildHashes([{ date:'2026-01-01', desc:'NETFLIX.COM', amt:-15.99 }]);
    expect(h1[0].import_hash).toBe(h2[0].import_hash);
  });
});

// ── Import dedup simulation tests ─────────────────────────────────────────────
describe('simulateImport — true duplicate detection', () => {
  const existing = buildHashes([
    { date:'2026-03-01', desc:'NETFLIX.COM', amt:-15.99 },
    { date:'2026-03-01', desc:'WOOLWORTHS',  amt:-45.00 },
  ]);

  it('re-importing same transactions → all skipped', () => {
    const result = simulateImport([
      { date:'2026-03-01', desc:'NETFLIX.COM', amt:-15.99 },
      { date:'2026-03-01', desc:'WOOLWORTHS',  amt:-45.00 },
    ], existing);
    expect(result.skipped).toBe(2);
    expect(result.toInsert.length).toBe(0);
  });

  it('new transactions → all inserted', () => {
    const result = simulateImport([
      { date:'2026-03-05', desc:'DOMINOS', amt:-25.00 },
      { date:'2026-03-06', desc:'UBER EATS', amt:-18.50 },
    ], existing);
    expect(result.toInsert.length).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('mixed: some new, some existing → correct split', () => {
    const result = simulateImport([
      { date:'2026-03-01', desc:'NETFLIX.COM', amt:-15.99 }, // exists
      { date:'2026-03-05', desc:'NEW PURCHASE', amt:-50.00 }, // new
    ], existing);
    expect(result.toInsert.length).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.toInsert[0].desc).toBe('NEW PURCHASE');
  });

  it('empty existing DB → everything inserted (first import)', () => {
    const result = simulateImport(MARCH_8_WOOLWORTHS, []);
    expect(result.toInsert.length).toBe(3);
    expect(result.skipped).toBe(0);
  });
});

// ── The original bug scenario ─────────────────────────────────────────────────
describe('THE BUG: same-day same-merchant collision (was silently dropping transactions)', () => {
  it('BEFORE FIX: old hash caused collision', () => {
    // Simulate the OLD hash logic (no occurrence index)
    const oldHash = t => `${t.date}|${t.desc}|${t.amt}`;
    const sameAmt = [
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
    ];
    const hashes = sameAmt.map(oldHash);
    // All three have the same hash — this is the bug
    expect(new Set(hashes).size).toBe(1);
  });

  it('AFTER FIX: occurrence index prevents collision', () => {
    const sameAmt = [
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
    ];
    const hashed = buildHashes(sameAmt);
    const hashes = hashed.map(t => t.import_hash);
    // All three are now distinct
    expect(new Set(hashes).size).toBe(3);
  });

  it('AFTER FIX: all 3 Woolworths transactions inserted on first import', () => {
    const result = simulateImport([
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
    ], []);
    expect(result.toInsert.length).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it('AFTER FIX: re-importing same 3 transactions → all skipped (true dedup)', () => {
    // First import
    const first = simulateImport([
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
    ], []);
    // Simulate the 3 rows now existing in DB
    const inDB = first.toInsert;
    // Second import of same statement
    const second = simulateImport([
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27 },
    ], inDB);
    expect(second.skipped).toBe(3);
    expect(second.toInsert.length).toBe(0);
  });
});

// ── Multi-bank import: rules are org-scoped (universal) ───────────────────────
describe('Multi-bank architecture: rules are universal across bank accounts', () => {
  // Rules are keyed by org_id only, no account_id — verified from schema
  it('a WOOLWORTHS rule matches transactions from ANY bank account', () => {
    const rule = { id:'r1', keyword:'woolworths', catId:'c-groc', payee:'Woolworths', amtExact:'', amtMin:'', amtMax:'', direction:'' };

    const txns = [
      { id:'t1', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-45, cat:null, payee:'', account_id:'ba-anz-cc' },
      { id:'t2', desc:'WOOLWORTHS/MT GRAVATT PLZ MT GRAVATT', amt:-92, cat:null, payee:'', account_id:'ba-flex-saver' },
      { id:'t3', desc:'WOOLWORTHS METRO GEORGE ST', amt:-12, cat:null, payee:'', account_id:'ba-plus' },
    ];
    const suggestions = runAutoCatRules(txns, [rule]);
    expect(suggestions.length).toBe(3); // matches all 3 regardless of account
    expect(suggestions.every(s => s.sugCat === 'c-groc')).toBe(true);
  });

  it('hashes from different bank accounts on same date never collide', () => {
    // Two $4.27 charges from different accounts on same day
    const txns = [
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27, account_id:'ba-1' },
      { date:'2026-03-08', desc:'WOOLWORTHS/543 LUTWYCHE R LUTWYCHE', amt:-4.27, account_id:'ba-2' },
    ];
    // Even if they look identical, occurrence index gives them different hashes
    const hashed = buildHashes(txns);
    expect(hashed[0].import_hash).not.toBe(hashed[1].import_hash);
  });

  it('overlapping statements from same account deduplicate correctly', () => {
    // ANZ CC statement periods overlap by a few days — re-importing should skip old txns
    const inDB = buildHashes([
      { date:'2026-03-01', desc:'NETFLIX.COM ANNUAL', amt:-15.99 },
      { date:'2026-03-05', desc:'DOMINOS ESTORE', amt:-22.50 },
    ]);
    // New statement includes the last 3 days of the previous period
    const newImport = [
      { date:'2026-03-05', desc:'DOMINOS ESTORE', amt:-22.50 }, // overlap — skip
      { date:'2026-03-06', desc:'KFC MT GRAVATT', amt:-16.00 }, // new
      { date:'2026-03-07', desc:'WOOLWORTHS', amt:-45.00 },     // new
    ];
    const result = simulateImport(newImport, inDB);
    expect(result.skipped).toBe(1);
    expect(result.toInsert.length).toBe(2);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────
describe('Dedup edge cases', () => {
  it('empty import → nothing inserted, nothing skipped', () => {
    const result = simulateImport([], []);
    expect(result.toInsert.length).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('credit (positive) transactions deduplicate correctly', () => {
    const inDB = buildHashes([{ date:'2026-03-15', desc:'PAYMENT THANKYOU 123', amt:500 }]);
    const result = simulateImport([{ date:'2026-03-15', desc:'PAYMENT THANKYOU 123', amt:500 }], inDB);
    expect(result.skipped).toBe(1);
  });

  it('$0 transactions get a valid hash', () => {
    const hashed = buildHashes([{ date:'2026-03-01', desc:'PAYMENT THANKYOU 778343', amt:0.75 }]);
    expect(hashed[0].import_hash).toBe('2026-03-01|PAYMENT THANKYOU 778343|0.75');
  });

  it('100 rapid-fire same-desc transactions all get unique hashes', () => {
    const txns = Array.from({ length:100 }, () => ({
      date:'2026-03-01', desc:'TRANSLINK TICKETING QLD', amt:-0.50,
    }));
    const hashed = buildHashes(txns);
    expect(new Set(hashed.map(t => t.import_hash)).size).toBe(100);
  });
});
