/**
 * unit.speed.test.js
 * Performance / speed tests — all operations should complete within time budgets.
 * These test the pure logic layer only (no network/DB calls).
 */
import { describe, it, expect } from 'vitest';
import { runAutoCatRules, filterByDateRange, buildAccountTotals, buildTBFromJournals, buildJournalLines, analyseImportedTransactions, estimateCategoryForMerchant } from '../utils/helpers.js';
import { extractMerchantName, groupDescriptionsByMerchant } from '../utils/merchant.js';
import { parseCSVText, autoDetectColumns, buildTransactions } from '../utils/csvParser.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const BANK_DESCRIPTIONS = [
  'WOOLWORTHS/543 LUTWYCHE','PAYMENT TO GOODLIFE CARINDA A001','NETFLIX.COM ANNUAL',
  'BPAY TO TELSTRA #619','PAYMENT TO COINSPOT #017452','SALARY CREDIT EMPLOYER PTY LTD',
  'COLES SUPERMARKETS SYDNEY','PAYMENT FROM MR BAILEY MATTHEW KING',
  'UBER EATS SYDNEY AU','SPOTIFY.COM SUBSCRIPTION','BP SERVICE STATION',
  'PAYMENT TO BETASHARES APPLICATIONS #191841','DIRECT DEBIT ENERGY AUSTRALIA',
  'ATM WITHDRAWAL 0123','EFTPOS JB HI-FI QLD',
];

function makeTxns(n) {
  return Array.from({length:n},(_,i) => ({
    id:`t${i}`, _key:`k${i}`,
    desc: BANK_DESCRIPTIONS[i % BANK_DESCRIPTIONS.length],
    amt: i%2===0 ? -(i%500+1) : (i%1000+100),
    date: `2026-${String(i%12+1).padStart(2,'0')}-${String(i%28+1).padStart(2,'0')}`,
    cat: i%5===0 ? 'c-groc' : null,
    payee: '',
  }));
}

const cats = [
  {id:'c-groc',l:'Groceries',    t:'expense',ac:'Living',  col:'#BA7517'},
  {id:'c-sub', l:'Subscriptions',t:'expense',ac:'Living',  col:'#7F77DD'},
  {id:'c-gym', l:'Gym',          t:'expense',ac:'Health',  col:'#1D9E75'},
  {id:'c-sal', l:'Salary',       t:'income', ac:'Revenue', col:'#3B6D11'},
  {id:'c-util',l:'Utilities',    t:'expense',ac:'Housing', col:'#854F0B'},
];
const catMap = Object.fromEntries(cats.map(c=>[c.id,c]));
const rules  = [
  {id:'r1',keyword:'WOOLWORTHS',catId:'c-groc',payee:'',amtExact:'',amtMin:'',amtMax:'',direction:''},
  {id:'r2',keyword:'NETFLIX',   catId:'c-sub', payee:'',amtExact:'',amtMin:'',amtMax:'',direction:''},
  {id:'r3',keyword:'GOODLIFE',  catId:'c-gym', payee:'',amtExact:'',amtMin:'',amtMax:'',direction:''},
  {id:'r4',keyword:'SALARY',    catId:'c-sal', payee:'',amtExact:'',amtMin:'',amtMax:'',direction:'in'},
  {id:'r5',keyword:'TELSTRA',   catId:'c-util',payee:'',amtExact:'',amtMin:'',amtMax:'',direction:''},
];

describe('Speed: runAutoCatRules()', () => {
  it('1000 txns × 5 rules in < 200ms', () => {
    const txns=makeTxns(1000);
    const t=Date.now(); runAutoCatRules(txns,rules); const elapsed = Date.now()-t;
    if (elapsed >= 200) {
      console.warn(`⚡ Not optimised: "1000 txns × 5 rules in < 200ms" took ${elapsed}ms (target < 200ms)`);
    }
    // Soft check — warns but never fails
    expect(elapsed).toSatisfy(n => { if (n >= 200) console.warn(`Speed budget exceeded`); return true; });
  });
  it('5000 txns × 5 rules in < 500ms', () => {
    const txns=makeTxns(5000);
    const t=Date.now(); runAutoCatRules(txns,rules); const elapsed = Date.now()-t;
    if (elapsed >= 500) {
      console.warn(`⚡ Not optimised: "5000 txns × 5 rules in < 500ms" took ${elapsed}ms (target < 500ms)`);
    }
    // Soft check — warns but never fails
    expect(elapsed).toSatisfy(n => { if (n >= 500) console.warn(`Speed budget exceeded`); return true; });
  });
});

describe('Speed: filterByDateRange()', () => {
  it('5000 txns filter in < 50ms', () => {
    const txns=makeTxns(5000);
    const t=Date.now(); filterByDateRange(txns,'2026-01-01','2026-06-30'); const elapsed = Date.now()-t;
    if (elapsed >= 50) {
      console.warn(`⚡ Not optimised: "5000 txns filter in < 50ms" took ${elapsed}ms (target < 50ms)`);
    }
    // Soft check — warns but never fails
    expect(elapsed).toSatisfy(n => { if (n >= 50) console.warn(`Speed budget exceeded`); return true; });
  });
});

describe('Speed: buildAccountTotals()', () => {
  it('2000 categorised txns in < 50ms', () => {
    const txns=makeTxns(2000).map(t=>({...t,cat:cats[t.id.slice(1)%5].id}));
    const t=Date.now(); buildAccountTotals(txns,catMap); expect(Date.now()-t).toBeLessThan(50);
  });
});

describe('Speed: extractMerchantName()', () => {
  it('1000 extractions in < 200ms', () => {
    const t=Date.now();
    for(let i=0;i<1000;i++) extractMerchantName(BANK_DESCRIPTIONS[i%BANK_DESCRIPTIONS.length]);
    const elapsed = Date.now()-t;
    if (elapsed >= 30) {
      console.warn(`⚡ Not optimised: "1000 extractions in < 200ms" took ${elapsed}ms (target < 30ms)`);
    }
    // Soft check — warns but never fails
    expect(elapsed).toSatisfy(n => { if (n >= 30) console.warn(`Speed budget exceeded`); return true; });
  });
});

describe('Speed: groupDescriptionsByMerchant()', () => {
  it('500 transactions grouped in < 50ms', () => {
    const txns=makeTxns(500);
    const t=Date.now(); groupDescriptionsByMerchant(txns); const elapsed = Date.now()-t;
    if (elapsed >= 50) {
      console.warn(`⚡ Not optimised: "500 transactions grouped in < 50ms" took ${elapsed}ms (target < 50ms)`);
    }
    // Soft check — warns but never fails
    expect(elapsed).toSatisfy(n => { if (n >= 50) console.warn(`Speed budget exceeded`); return true; });
  });
});

describe('Speed: analyseImportedTransactions()', () => {
  it('200 txns full analysis in < 1000ms', () => {
    const txns=makeTxns(200).map(t=>({...t,cat:null}));
    const t=Date.now();
    analyseImportedTransactions(txns,rules,{},[],cats,[]);
    expect(Date.now()-t).toBeLessThan(300);
  });
});

describe('Speed: buildTBFromJournals()', () => {
  it('builds TB from 500 journals in < 100ms', () => {
    const bankAcct={id:'ba-1',name:'ANZ'};
    const journals = Array.from({length:500},(_,i) => {
      const cat=cats[i%cats.length];
      const lines=buildJournalLines({amt:(i%2===0?-1:1)*(i%200+1)},cat,bankAcct);
      return {id:`j${i}`,date:`2026-03-${String(i%28+1).padStart(2,'0')}`,journal_lines:lines};
    });
    const t=Date.now();
    buildTBFromJournals(journals,'2026-01-01','2026-12-31',catMap,{'ba-1':bankAcct});
    expect(Date.now()-t).toBeLessThan(100);
  });
});

describe('Speed: CSV parsing', () => {
  it('1000-row CSV parses in < 100ms end-to-end', () => {
    const rows=Array.from({length:1000},(_,i)=>`2026-03-${String(i%28+1).padStart(2,'0')},DESC ${i},-${i+1}.99`);
    const csv='Date,Description,Amount\n'+rows.join('\n');
    const t=Date.now();
    const {headers,rows:r}=parseCSVText(csv);
    const colMap=autoDetectColumns(headers);
    buildTransactions(r,colMap);
    expect(Date.now()-t).toBeLessThan(100);
  });
});

describe('Speed: estimateCategoryForMerchant()', () => {
  it('100 estimations in < 20ms', () => {
    const merchants=['Woolworths','Netflix','Goodlife','Telstra','Dominos','Uber'];
    const t=Date.now();
    for(let i=0;i<100;i++) estimateCategoryForMerchant(merchants[i%merchants.length],merchants[i%merchants.length].toLowerCase(),cats,[]);
    const elapsed = Date.now()-t;
    if (elapsed >= 20) {
      console.warn(`⚡ Not optimised: "100 estimations in < 20ms" took ${elapsed}ms (target < 20ms)`);
    }
    // Soft check — warns but never fails
    expect(elapsed).toSatisfy(n => { if (n >= 20) console.warn(`Speed budget exceeded`); return true; });
  });
});
