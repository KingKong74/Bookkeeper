/**
 * unit.csv.test.js
 * Unit tests for csvParser.js — parsing, column detection, transaction building.
 * Coverage: speed (large inputs), internal logic, error handling, data flow.
 */
import { describe, it, expect } from 'vitest';
import { parseCSVText, autoDetectColumns, buildTransactions } from '../utils/csvParser.js';

// ── parseCSVText ──────────────────────────────────────────────────────────────
describe('parseCSVText()', () => {
  it('parses simple CSV',            () => { const r=parseCSVText('a,b,c\n1,2,3'); expect(r.headers).toEqual(['a','b','c']); expect(r.rows[0]).toEqual(['1','2','3']); });
  it('returns no rows for 1-line CSV', () => { const r=parseCSVText('a,b,c'); expect(r.rows.length).toBe(0); });
  it('returns empty for blank input', () => { const r=parseCSVText(''); expect(r.headers).toEqual([]); });
  it('handles quoted fields with commas', () => {
    const r=parseCSVText('date,desc,amt\n2026-03-01,"WOOLWORTHS, METRO",-45.5');
    expect(r.rows[0][1]).toBe('WOOLWORTHS, METRO');
  });
  it('handles quoted fields with numbers', () => {
    const r=parseCSVText('date,desc,amt\n2026-03-01,NETFLIX,"-22.99"');
    expect(r.rows[0][2]).toBe('-22.99');
  });
  it('trims whitespace from fields',   () => {
    const r=parseCSVText('date , desc , amt\n2026-01-01 , NETFLIX , -22.99');
    expect(r.headers[0]).toBe('date');
  });
  it('skips blank lines',              () => {
    const r=parseCSVText('a,b\n\n1,2\n\n3,4');
    expect(r.rows.length).toBe(2);
  });

  // Speed test — 1000-row CSV should parse in < 200ms
  it('parses 1000 rows in < 200ms', () => {
    const rows = Array.from({length:1000},(_,i)=>`2026-03-${String(i%28+1).padStart(2,'0')},DESC ${i},-${i}.99`);
    const csv = 'Date,Description,Amount\n' + rows.join('\n');
    const start = Date.now();
    const r = parseCSVText(csv);
    expect(Date.now() - start).toBeLessThan(200);
    expect(r.rows.length).toBe(1000);
  });
});

// ── autoDetectColumns ─────────────────────────────────────────────────────────
describe('autoDetectColumns()', () => {
  it('detects standard Date/Description/Amount',  () => {
    const m=autoDetectColumns(['Date','Description','Amount']);
    expect(m.date).toBe(0); expect(m.desc).toBe(1); expect(m.amt).toBe(2);
  });
  it('detects ANZ Narration column',              () => {
    const m=autoDetectColumns(['Date','Narration','Amount'],'anz-export.csv');
    expect(m.desc).toBe(1);
  });
  it('detects debit/credit columns',              () => {
    const m=autoDetectColumns(['Date','Details','Debit','Credit']);
    expect(m.debit).toBeGreaterThanOrEqual(0);
    expect(m.credit).toBeGreaterThanOrEqual(0);
  });
  it('returns -1 for missing columns',            () => {
    const m=autoDetectColumns(['Date','Notes']);
    expect(m.amt).toBe(-1);
  });
  it('case-insensitive header matching',          () => {
    const m=autoDetectColumns(['DATE','DESCRIPTION','AMOUNT']);
    expect(m.date).toBe(0); expect(m.desc).toBe(1); expect(m.amt).toBe(2);
  });
  it('detects CBA format (Reference column)',     () => {
    const m=autoDetectColumns(['Date','Reference','Debit Amount','Credit Amount']);
    expect(m.date).toBe(0); expect(m.desc).toBe(1);
  });
  it('handles empty headers gracefully',          () => {
    expect(()=>autoDetectColumns([])).not.toThrow();
  });
});

// ── buildTransactions ─────────────────────────────────────────────────────────
describe('buildTransactions()', () => {
  const colMap = { date:0, desc:1, amt:2, debit:-1, credit:-1 };
  const rows   = [
    ['2026-03-01', 'WOOLWORTHS METRO', '-45.50'],
    ['2026-03-02', 'SALARY CREDIT',     '5000'],
    ['2026-03-03', 'NETFLIX.COM',       '-22.99'],
  ];

  it('returns correct transaction count',    () => expect(buildTransactions(rows,colMap).transactions.length).toBe(3));
  it('parses amount correctly',              () => expect(buildTransactions(rows,colMap).transactions[0].amt).toBeCloseTo(-45.50));
  it('parses positive income correctly',     () => expect(buildTransactions(rows,colMap).transactions[1].amt).toBe(5000));
  it('parses description correctly',         () => expect(buildTransactions(rows,colMap).transactions[0].desc).toBe('WOOLWORTHS METRO'));
  it('parses date correctly',                () => expect(buildTransactions(rows,colMap).transactions[0].date).toBe('2026-03-01'));
  it('initialises cat to null',              () => expect(buildTransactions(rows,colMap).transactions[0].cat).toBeNull());
  it('handles $-prefixed amounts',           () => {
    const r=buildTransactions([['2026-01-01','TEST','$-99.99']],colMap);
    expect(r.transactions[0].amt).toBeCloseTo(-99.99);
  });
  it('handles comma-formatted amounts',      () => {
    const r=buildTransactions([['2026-01-01','TEST','1,234.56']],colMap);
    expect(r.transactions[0].amt).toBeCloseTo(1234.56);
  });
  it('skips rows with missing date',         () => {
    const r=buildTransactions([['','ORPHAN','-10'],...rows],colMap);
    expect(r.transactions.length).toBe(3); // orphan skipped
  });
  it('skips rows with missing description',  () => {
    const r=buildTransactions([['2026-01-01','','-10'],...rows],colMap);
    expect(r.transactions.length).toBe(3);
  });
  it('detects duplicates against existing',  () => {
    const existing=[{date:'2026-03-01',desc:'WOOLWORTHS METRO',amt:-45.50}];
    const r=buildTransactions(rows,colMap,existing);
    expect(r.duplicateCount).toBe(1);
    expect(r.transactions.length).toBe(2);
  });
  it('debit/credit columns → correct sign',  () => {
    const dcMap={date:0,desc:1,amt:-1,debit:2,credit:3};
    const r=buildTransactions([['2026-03-01','RENT','200','0'],['2026-03-02','SALARY','0','5000']],dcMap);
    expect(r.transactions[0].amt).toBeCloseTo(-200); // debit = negative
    expect(r.transactions[1].amt).toBeCloseTo(5000); // credit = positive
  });
  it('empty rows returns empty result',       () => {
    const r=buildTransactions([],colMap);
    expect(r.transactions.length).toBe(0);
    expect(r.duplicateCount).toBe(0);
  });

  // Speed: 500 rows should build in < 100ms
  it('builds 500 rows in < 100ms', () => {
    const bigRows=Array.from({length:500},(_,i)=>[`2026-03-${String(i%28+1).padStart(2,'0')}`,`DESC ${i}`,`-${i}`]);
    const start=Date.now();
    buildTransactions(bigRows,colMap);
    expect(Date.now()-start).toBeLessThan(100);
  });
});
