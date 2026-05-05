/**
 * unit.tax.test.js
 * Unit tests for taxEngine.js — Australian tax calculation.
 * Coverage: bracket logic, offsets, Medicare, HELP, edge cases.
 */
import { describe, it, expect } from 'vitest';
import { calculateTax } from '../utils/taxEngine.js';

// FY2024-25 Stage 3 brackets — using actual DB column names
const brackets = [
  { min_income:0,       max_income:18200,  rate:0,    base_tax:0      },
  { min_income:18201,   max_income:45000,  rate:0.19, base_tax:0      },
  { min_income:45001,   max_income:135000, rate:0.325,base_tax:5092   },
  { min_income:135001,  max_income:190000, rate:0.37, base_tax:34297  },
  { min_income:190001,  max_income:null,   rate:0.45, base_tax:54547  },
];
const offsets = [{ offset_type:'lito', max_offset:700, phase_out_start:37500, phase_out_end:66667, phase_out_rate:0.024 }];
const medicare = { levy_rate:0.02, shade_in_start:26000, shade_in_end:32500, surcharge_t1_start:93000, surcharge_t1_rate:0.01 };
const helpRates = [
  { min_income:0,      max_income:54435, rate:0    },
  { min_income:54436,  max_income:57538, rate:0.01 },
  { min_income:57539,  max_income:60991, rate:0.02 },
  { min_income:60992,  max_income:64999, rate:0.025},
  { min_income:65000,  max_income:70000, rate:0.03 },
  { min_income:70001,  max_income:null,  rate:0.05 },
];
const refData = { brackets, offsets, medicare, helpRates };
const baseProfile = { salary_sacrifice_super:0, personal_super_contrib:0, other_deductions:0, has_private_health:false, has_help_debt:false };

describe('calculateTax() — basic brackets', () => {
  it('zero income → zero tax',          () => expect(calculateTax({grossIncome:0,  profile:baseProfile,refData}).totalLiability).toBe(0));
  it('tax-free threshold → zero income tax', () => {
    const r = calculateTax({grossIncome:18200, profile:baseProfile, refData});
    expect(r.incomeTax).toBe(0);
  });
  it('$50k income → reasonable tax',    () => {
    const r = calculateTax({grossIncome:50000, profile:baseProfile, refData});
    expect(r.incomeTax).toBeGreaterThan(5000);
    expect(r.incomeTax).toBeLessThan(12000);
  });
  it('$135k → correct bracket tax',     () => {
    const r = calculateTax({grossIncome:135000, profile:baseProfile, refData});
    expect(r.incomeTax).toBeGreaterThan(30000); // in 32.5% bracket
    expect(r.incomeTax).toBeLessThan(40000);
  });
  it('$200k → 45% marginal rate',       () => {
    const r = calculateTax({grossIncome:200000, profile:baseProfile, refData});
    expect(r.incomeTax).toBeGreaterThan(54547);
  });
  it('returns effectiveRate %',         () => {
    const r = calculateTax({grossIncome:80000, profile:baseProfile, refData});
    expect(r.effectiveRate).toBeGreaterThan(0);
    expect(r.effectiveRate).toBeLessThan(100);
  });
});

describe('calculateTax() — deductions', () => {
  it('salary sacrifice reduces taxable income', () => {
    const with0    = calculateTax({grossIncome:80000, profile:{...baseProfile,salary_sacrifice_super:0},    refData});
    const with5000 = calculateTax({grossIncome:80000, profile:{...baseProfile,salary_sacrifice_super:5000}, refData});
    expect(with5000.totalLiability).toBeLessThan(with0.totalLiability);
  });
  it('personal super deduction reduces tax',    () => {
    const with0  = calculateTax({grossIncome:80000, profile:{...baseProfile,personal_super_contrib:0},    refData});
    const with3k = calculateTax({grossIncome:80000, profile:{...baseProfile,personal_super_contrib:3000}, refData});
    expect(with3k.totalLiability).toBeLessThan(with0.totalLiability);
  });
  it('other deductions reduce taxable income',   () => {
    const base    = calculateTax({grossIncome:60000, profile:{...baseProfile,other_deductions:0},    refData});
    const reduced = calculateTax({grossIncome:60000, profile:{...baseProfile,other_deductions:2000}, refData});
    expect(reduced.totalLiability).toBeLessThan(base.totalLiability);
  });
  it('deductions cannot make taxable income negative', () => {
    const r = calculateTax({grossIncome:10000, profile:{...baseProfile,other_deductions:50000}, refData});
    expect(r.taxableIncome).toBe(0);
    expect(r.totalLiability).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateTax() — Medicare levy', () => {
  it('no Medicare below shade-in threshold',    () => {
    const r = calculateTax({grossIncome:20000, profile:baseProfile, refData});
    expect(r.medicare).toBe(0);
  });
  it('2% Medicare on full income above shade-in', () => {
    const r = calculateTax({grossIncome:80000, profile:baseProfile, refData});
    expect(r.medicare).toBeCloseTo(80000 * 0.02, 0);
  });
  it('Medicare surcharge when no private health + high income', () => {
    const r = calculateTax({grossIncome:100000, profile:{...baseProfile,has_private_health:false}, refData});
    expect(r.medicareLevySurcharge).toBeGreaterThan(0);
  });
  it('no Medicare surcharge with private health', () => {
    const r = calculateTax({grossIncome:100000, profile:{...baseProfile,has_private_health:true}, refData});
    expect(r.medicareLevySurcharge).toBe(0);
  });
});

describe('calculateTax() — HELP/HECS', () => {
  it('no HELP repayment when flag is false',    () => {
    const r = calculateTax({grossIncome:70000, profile:{...baseProfile,has_help_debt:false}, refData});
    expect(r.helpRepayment).toBe(0);
  });
  it('HELP repayment when flag is true + income above threshold', () => {
    const r = calculateTax({grossIncome:70000, profile:{...baseProfile,has_help_debt:true}, refData});
    expect(r.helpRepayment).toBeGreaterThan(0);
  });
  it('no HELP repayment below threshold even with flag', () => {
    const r = calculateTax({grossIncome:40000, profile:{...baseProfile,has_help_debt:true}, refData});
    expect(r.helpRepayment).toBe(0);
  });
});

describe('calculateTax() — error handling', () => {
  it('returns safe result with no refData',  () => {
    const r = calculateTax({grossIncome:80000, profile:baseProfile, refData:{}});
    expect(r).toBeDefined();
    expect(r.totalLiability).toBeGreaterThanOrEqual(0);
  });
  it('returns safe result with null profile', () => {
    const r = calculateTax({grossIncome:80000, profile:null, refData});
    expect(r).toBeDefined();
    expect(r.totalLiability).toBeGreaterThanOrEqual(0);
  });
  it('handles negative income gracefully',   () => {
    const r = calculateTax({grossIncome:-1000, profile:baseProfile, refData});
    expect(r.totalLiability).toBeGreaterThanOrEqual(0);
  });
  it('handles very large income',            () => {
    const r = calculateTax({grossIncome:5000000, profile:baseProfile, refData});
    expect(r.totalLiability).toBeGreaterThan(0);
    expect(r.effectiveRate).toBeLessThan(50);
  });
});
