/**
 * utils/merchant.js
 * -----------------
 * Smart merchant name extraction from raw bank descriptions.
 * Pure functions — no imports, fully testable in isolation.
 */

/**
 * extractMerchantName(description)
 * Extracts the merchant/payee name from a raw bank transaction description.
 *
 * Examples:
 *   "WOOLWORTHS/543 LUTWYCHE R LUTWYCHE"     → "Woolworths"
 *   "PAYMENT TO GOODLIFE CARINDA A00LK9U"    → "Goodlife"
 *   "NETFLIX.COM"                             → "Netflix"
 *   "BPAY TO TELSTRA #619288"                → "Telstra"
 *   "EFTPOS COLES SUPERMARKETS SYDNEY"        → "Coles"
 *   "SALARY CREDIT COMPANY PTY LTD"          → null  (internal)
 */
export function extractMerchantName(description) {
  if (!description || typeof description !== 'string') return null;
  let s = description.trim();

  // Descriptions that are always internal/non-merchant — return null
  const IGNORE_RE = [
    /^SALARY\s+CREDIT/i,
    /^INTERNET\s+BANKING/i,
    /^BANK\s+FEE/i,
    /^ACCOUNT\s+KEEPING/i,
    /^ATM\b/i,
    /^CASH\s+WITHDRAWAL/i,
    /^OPENING\s+BALANCE/i,
    /^CLOSING\s+BALANCE/i,
    /^CREDIT\s+INTEREST/i,
    /^INTEREST\s+CHARGED/i,
    /^FUNDS\s+RETURNED/i,
    /^TRANSFER\s+(TO|FROM)\s+(ANZ|NAB|CBA|WBC|ING|ST\s+GEORGE)/i,
  ];
  for (const r of IGNORE_RE) {
    if (r.test(s)) return null;
  }

  // Strip leading payment verbs
  const PREFIXES = [
    /^PAYMENT\s+TO\s+/i,
    /^PAYMENT\s+FROM\s+/i,
    /^BPAY\s+TO\s+/i,
    /^BPAY\s*/i,
    /^DIRECT\s+DEBIT\s+/i,
    /^DIRECT\s+CREDIT\s+/i,
    /^EFTPOS\s+/i,
    /^PURCHASE\s+/i,
    /^POS\s+/i,
    /^VISA\s+PURCHASE\s+/i,
    /^VISA\s+DEBIT\s+/i,
    /^MASTERCARD\s+/i,
    /^TRANSFER\s+TO\s+/i,
    /^TRANSFER\s+FROM\s+/i,
    /^RECURRING\s+PAYMENT\s+/i,
    /^AUTO\s+PAYMENT\s+/i,
  ];
  for (const r of PREFIXES) {
    s = s.replace(r, '').trim();
  }

  // Split on "/" — merchant is before the slash (e.g. WOOLWORTHS/543)
  s = s.split('/')[0].trim();

  // Strip domain suffix from web-style names (NETFLIX.COM → NETFLIX)
  s = s.replace(/\.(COM|NET|ORG|AU|CO|IO|APP)(\s|$)/i, ' ').trim();

  // Tokenise
  const tokens = s.split(/\s+/);

  // Noise patterns — stop collecting merchant words when we hit these
  const NOISE = [
    (w) => /^\d+$/.test(w),                             // pure numbers: 543, 9182
    (w) => /^[A-Z]*\d+[A-Z0-9]*$/.test(w) && w.length >= 5, // codes with digits: A00LKY8U, T00123
    (w) => /^#/.test(w),                                 // #619288
    (w) => w.length <= 1,                                // single chars: R, A
    (w) => /^\d{2,4}[A-Z]{0,2}$/.test(w),              // short codes: 33B, 543, 12AB
  ];

  // Stop words that end the merchant name (after at least 1 word collected)
  const STOP = new Set([
    'QLD','NSW','VIC','WA','SA','TAS','ACT','NT',
    'AUSTRALIA','AUSTRALIAN',
    'SYDNEY','MELBOURNE','BRISBANE','PERTH','ADELAIDE','HOBART','DARWIN','CANBERRA',
    'NORTH','SOUTH','EAST','WEST','CENTRAL','UPPER','LOWER','INNER','OUTER',
    'SUPERMARKET','SUPERMARKETS','STORE','STORES','MARKET','MARKETS','SHOP',
    'PTY','LTD','LIMITED','PLC','INC','CORP','GROUP',
    'ONLINE','INTERNET','DIGITAL','APP','MOBILE','WEB',
    'ANNUAL','MONTHLY','WEEKLY','SUBSCRIPTION','MEMBER','MEMBERSHIP',
    'ACCOUNT','ACCOUNTS','SERVICE','SERVICES','AUSTRALIA',
    'APPLICATIONS','APPLICATION','SOLUTIONS','SOLUTION','TECHNOLOGIES','TECHNOLOGY',
    'MANAGEMENT','SYSTEMS','SYSTEM','CARINDA','METRO','CITY','VILLAGE','PLAZA','HEIGHTS',
    'THE', 'AND', 'OF',
  ]);

  const merchantTokens = [];
  for (const token of tokens) {
    const upper = token.toUpperCase();
    // Stop on noise
    if (NOISE.some(fn => fn(upper))) break;
    // Stop on location/generic words (only after we have at least 1 word)
    if (merchantTokens.length > 0 && STOP.has(upper)) break;
    // Cap at 3 words
    if (merchantTokens.length >= 3) break;
    merchantTokens.push(token);
  }

  if (merchantTokens.length === 0) return null;

  // Title-case
  const raw    = merchantTokens.join(' ').toLowerCase();
  const titled = raw.replace(/\b\w/g, c => c.toUpperCase());

  // Reject if result is too generic to be a merchant name
  const TOO_GENERIC = new Set(['Payment','Transfer','Credit','Debit','Bpay','Pos','Eftpos','The','A','From','To','Mr','Mrs','Ms','Dr']);
  if (TOO_GENERIC.has(titled)) return null;

  return titled;
}

/**
 * groupDescriptionsByMerchant(transactions)
 * Groups transactions by extracted merchant name.
 * Returns merchants appearing 2+ times, sorted by frequency.
 */
export function groupDescriptionsByMerchant(transactions) {
  const groups = {};

  for (const t of transactions) {
    const desc     = t.desc || t.description || '';
    const merchant = extractMerchantName(desc);
    if (!merchant) continue;

    const key = merchant.toLowerCase();
    if (!groups[key]) {
      groups[key] = {
        name:        merchant,
        keyword:     key,
        count:       0,
        txnIds:      [],
        amounts:     [],
        exampleDesc: desc,
      };
    }
    groups[key].count++;
    groups[key].txnIds.push(t.id || t._key);
    groups[key].amounts.push(Math.abs(parseFloat(t.amt ?? t.amount) || 0));
  }

  return Object.values(groups)
    .filter(g => g.count >= 2)
    .sort((a, b) => b.count - a.count);
}
