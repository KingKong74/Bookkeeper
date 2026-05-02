/**
 * utils/taxEngine.js
 * ------------------
 * Australian individual income tax calculator.
 *
 * Handles:
 *   - Progressive tax brackets (FY2024-25 Stage 3 cuts)
 *   - Medicare levy (2%) with low-income shade-in
 *   - Medicare levy surcharge (if no private health, income > threshold)
 *   - Low Income Tax Offset (LITO)
 *   - Salary sacrifice super reduction
 *   - Personal super contribution deduction
 *   - HELP/HECS repayment estimate
 *
 * All functions are pure — no side effects, no API calls.
 * The reference data (brackets, offsets, etc.) is passed in
 * from the DB so rates can be updated without a code change.
 *
 * Usage:
 *   const result = calculateTax({ grossIncome, profile, refData });
 */


/**
 * Main tax calculation entry point.
 *
 * @param {object} params
 * @param {number} params.grossIncome       – total income from transactions (income categories)
 * @param {object} params.profile           – tax_profiles row from DB
 * @param {object} params.refData           – { brackets, offsets, medicare, helpRates }
 * @returns {TaxResult}
 */
export function calculateTax({ grossIncome, profile, refData }) {
  if (!refData?.brackets?.length) {
    return emptyResult(grossIncome);
  }

  const {
    salary_sacrifice_super  = 0,
    personal_super_contrib  = 0,
    other_deductions        = 0,
    has_private_health      = false,
    has_help_debt           = false,
  } = profile || {};

  // ── Step 1: Taxable income ────────────────────────────────
  const totalDeductions = (
    Number(salary_sacrifice_super) +
    Number(personal_super_contrib) +
    Number(other_deductions)
  );
  const taxableIncome = Math.max(0, grossIncome - totalDeductions);

  // ── Step 2: Income tax from brackets ─────────────────────
  const incomeTax = calcBracketTax(taxableIncome, refData.brackets);

  // ── Step 3: Low Income Tax Offset (LITO) ─────────────────
  const lito = calcLITO(taxableIncome, refData.offsets);

  // ── Step 4: Tax after offsets ─────────────────────────────
  const taxAfterOffsets = Math.max(0, incomeTax - lito);

  // ── Step 5: Medicare levy ─────────────────────────────────
  const medicare = calcMedicare(taxableIncome, refData.medicare);

  // ── Step 6: Medicare levy surcharge (no private health) ───
  const mls = calcMLS(taxableIncome, has_private_health, refData.medicare);

  // ── Step 7: HELP repayment ────────────────────────────────
  const helpRepayment = has_help_debt
    ? calcHELP(taxableIncome, refData.helpRates)
    : 0;

  // ── Step 8: Total liability ───────────────────────────────
  const totalLiability = taxAfterOffsets + medicare + mls + helpRepayment;

  // ── Step 9: Effective rate ────────────────────────────────
  const effectiveRate = grossIncome > 0
    ? (totalLiability / grossIncome) * 100
    : 0;

  // ── Step 10: Marginal rate ────────────────────────────────
  const marginalRate = getMarginalRate(taxableIncome, refData.brackets);

  return {
    grossIncome,
    totalDeductions,
    taxableIncome,
    incomeTax,
    lito,
    taxAfterOffsets,
    medicare,
    medicareLevySurcharge: mls,
    helpRepayment,
    totalLiability,
    effectiveRate: Math.round(effectiveRate * 10) / 10,   // 1 decimal place
    marginalRate:  Math.round(marginalRate * 100),         // as whole % e.g. 32
    breakdown: [
      { label: 'Income tax',              amount: incomeTax },
      { label: 'Low income tax offset',   amount: -lito, isOffset: true },
      { label: 'Medicare levy (2%)',       amount: medicare },
      ...(mls > 0 ? [{ label: 'Medicare levy surcharge', amount: mls }] : []),
      ...(helpRepayment > 0 ? [{ label: 'HELP repayment', amount: helpRepayment }] : []),
    ],
  };
}


// ── Private calculation helpers ───────────────────────────────────────────────

/**
 * Calculate income tax from progressive brackets.
 * Each bracket has: min_income, max_income (null = no limit), rate, base_tax
 */
function calcBracketTax(taxableIncome, brackets) {
  // Find the applicable bracket (highest min that is <= taxableIncome)
  const bracket = [...brackets]
    .reverse()
    .find(b => taxableIncome >= b.min_income);

  if (!bracket) return 0;

  const taxInBracket = (taxableIncome - bracket.min_income + 1) * bracket.rate;
  return Math.round((Number(bracket.base_tax) + taxInBracket) * 100) / 100;
}

/**
 * Calculate Low Income Tax Offset (LITO).
 * Phases out between phase_out_start and phase_out_end.
 */
function calcLITO(taxableIncome, offsets = []) {
  const lito = offsets.find(o => o.offset_type === 'lito');
  if (!lito) return 0;

  if (taxableIncome <= lito.phase_out_start) {
    return Number(lito.max_offset);
  }
  if (taxableIncome >= lito.phase_out_end) {
    return 0;
  }
  const reduction = (taxableIncome - lito.phase_out_start) * Number(lito.phase_out_rate);
  return Math.max(0, Number(lito.max_offset) - reduction);
}

/**
 * Calculate Medicare levy (2% of taxable income).
 * Shades in between shade_in_start and shade_in_end for low incomes.
 */
function calcMedicare(taxableIncome, config) {
  if (!config) return taxableIncome * 0.02;

  if (taxableIncome <= config.shade_in_start) return 0;

  if (taxableIncome < config.shade_in_end) {
    // Shade-in zone: levy increases gradually
    const levyIfFull = taxableIncome * config.levy_rate;
    const reduction  = (config.shade_in_end - taxableIncome) * config.levy_rate * 10;
    return Math.max(0, levyIfFull - reduction);
  }

  return taxableIncome * Number(config.levy_rate);
}

/**
 * Calculate Medicare levy surcharge.
 * Applies if income > threshold AND no private hospital cover.
 * Rate is 1% (tier 1) — we use the base tier for simplicity.
 */
function calcMLS(taxableIncome, hasPrivateHealth, config) {
  if (hasPrivateHealth) return 0;
  if (!config?.surcharge_t1_start) return 0;
  if (taxableIncome < config.surcharge_t1_start) return 0;
  return taxableIncome * Number(config.surcharge_t1_rate);
}

/**
 * Calculate estimated HELP repayment for the year.
 */
function calcHELP(taxableIncome, helpRates = []) {
  const bracket = [...helpRates]
    .reverse()
    .find(r => taxableIncome >= r.min_income);
  if (!bracket) return 0;
  return taxableIncome * Number(bracket.rate);
}

/** Get the marginal tax rate (as a decimal) for a given income */
function getMarginalRate(taxableIncome, brackets) {
  const bracket = [...brackets]
    .reverse()
    .find(b => taxableIncome >= b.min_income);
  return bracket ? Number(bracket.rate) : 0;
}

/** Return a zeroed-out result when ref data isn't loaded yet */
function emptyResult(grossIncome) {
  return {
    grossIncome,
    totalDeductions: 0,
    taxableIncome:   grossIncome,
    incomeTax:       0,
    lito:            0,
    taxAfterOffsets: 0,
    medicare:        0,
    medicareLevySurcharge: 0,
    helpRepayment:   0,
    totalLiability:  0,
    effectiveRate:   0,
    marginalRate:    0,
    breakdown:       [],
  };
}


/**
 * Derive gross income from a set of transactions and category map.
 * Only counts income-type categories.
 *
 * @param {object[]} transactions
 * @param {object}   catMap  – { [categoryId]: category }
 * @returns {number}
 */
export function deriveIncomeFromTransactions(transactions, catMap) {
  return transactions
    .filter(t => {
      const cat = catMap[t.category_id];
      return cat && cat.type === 'income' && t.amount > 0;
    })
    .reduce((sum, t) => sum + Number(t.amount), 0);
}


/**
 * Format a tax amount nicely with sign.
 * Negative amounts (offsets/rebates) shown in green.
 */
export function fmtTaxAmount(amount, isOffset = false) {
  const abs = Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${isOffset ? '−' : ''} $${abs}`;
}
