/**
 * seeds.js
 * --------
 * Default data loaded on first run (before the user has any saved state).
 * All of this gets written to localStorage on first load, then the user's
 * own data takes over. To reset the app to defaults, clear localStorage.
 */

// ── Colour palette used for categories and payee avatars ──────────────────────
export const PALETTE = [
  '#3B6D11', '#1D9E75', '#639922', '#085041',
  '#BA7517', '#854F0B', '#993C1D', '#D85A30',
  '#185FA5', '#0C447C', '#D4537E', '#993556',
  '#7F77DD', '#534AB7', '#0F6E56', '#E24B4A',
  '#5F5E5A', '#444441', '#888780', '#A32D2D',
];

// ── Default transaction categories ───────────────────────────────────────────
// Each category has:
//   id    – stable key used in transactions
//   l     – display label
//   col   – hex colour
//   t     – accounting type: income | expense | asset | liability | equity
//   ac    – account group name (used in Chart of Accounts & Trial Balance)
export const DEFAULT_CATEGORIES = [
  { id: 'salary',        l: 'Salary',           col: '#3B6D11', t: 'income',    ac: 'Revenue' },
  { id: 'interest',      l: 'Interest received', col: '#1D9E75', t: 'income',    ac: 'Revenue' },
  { id: 'freelance',     l: 'Freelance income',  col: '#639922', t: 'income',    ac: 'Revenue' },
  { id: 'groceries',     l: 'Groceries',         col: '#BA7517', t: 'expense',   ac: 'Living expenses' },
  { id: 'utilities',     l: 'Utilities',         col: '#854F0B', t: 'expense',   ac: 'Utilities' },
  { id: 'rent_exp',      l: 'Rent / mortgage',   col: '#993C1D', t: 'expense',   ac: 'Housing' },
  { id: 'transport',     l: 'Transport',         col: '#185FA5', t: 'expense',   ac: 'Transport' },
  { id: 'dining',        l: 'Dining & café',     col: '#D4537E', t: 'expense',   ac: 'Entertainment' },
  { id: 'entertainment', l: 'Entertainment',     col: '#7F77DD', t: 'expense',   ac: 'Entertainment' },
  { id: 'health',        l: 'Health',            col: '#0F6E56', t: 'expense',   ac: 'Health' },
  { id: 'insurance',     l: 'Insurance',         col: '#534AB7', t: 'expense',   ac: 'Insurance' },
  { id: 'savings',       l: 'Savings transfer',  col: '#5F5E5A', t: 'equity',    ac: 'Savings' },
  { id: 'assets',        l: 'Asset purchase',    col: '#444441', t: 'asset',     ac: 'Fixed assets' },
  { id: 'loan',          l: 'Loan repayment',    col: '#E24B4A', t: 'liability', ac: 'Liabilities' },
  { id: 'other',         l: 'Other',             col: '#888780', t: 'expense',   ac: 'Miscellaneous' },
];

// ── Sample transactions (April 2025) ─────────────────────────────────────────
// Each transaction has:
//   id    – unique number
//   date  – ISO date string YYYY-MM-DD
//   desc  – raw bank description
//   amt   – amount (negative = money out, positive = money in)
//   cat   – category id (or null if unallocated)
//   payee – payee/payer name (or empty string)
//   note  – user's personal note (or empty string)
export const DEFAULT_TRANSACTIONS = [
  { id: 1,  date: '2025-04-01', desc: 'Opening balance',          amt:  5000.00, cat: 'savings',       payee: '',                note: '' },
  { id: 2,  date: '2025-04-02', desc: 'Woolworths Supermarkets',  amt:  -187.45, cat: 'groceries',     payee: 'Woolworths',      note: '' },
  { id: 3,  date: '2025-04-04', desc: 'Ergon Energy electricity', amt:  -210.00, cat: 'utilities',     payee: 'Ergon Energy',    note: 'April bill' },
  { id: 4,  date: '2025-04-05', desc: 'Salary Employer Pty Ltd',  amt:  4850.00, cat: 'salary',        payee: 'Employer Pty Ltd',note: '' },
  { id: 5,  date: '2025-04-07', desc: 'Rent payment Realty',      amt: -1800.00, cat: 'rent_exp',      payee: 'Realty',          note: 'April rent' },
  { id: 6,  date: '2025-04-08', desc: 'Coles Supermarkets',       amt:  -142.30, cat: 'groceries',     payee: 'Coles',           note: '' },
  { id: 7,  date: '2025-04-09', desc: 'Uber Eats',                amt:   -45.90, cat: 'dining',        payee: 'Uber Eats',       note: '' },
  { id: 8,  date: '2025-04-10', desc: 'Translink QLD',            amt:   -50.00, cat: 'transport',     payee: 'Translink',       note: 'Monthly go card top up' },
  { id: 9,  date: '2025-04-11', desc: 'Netflix subscription',     amt:   -22.99, cat: 'entertainment', payee: 'Netflix',         note: '' },
  { id: 10, date: '2025-04-12', desc: 'Chemist Warehouse',        amt:   -68.50, cat: 'health',        payee: 'Chemist Warehouse',note: '' },
  { id: 11, date: '2025-04-14', desc: 'Woolworths Supermarkets',  amt:  -203.10, cat: 'groceries',     payee: 'Woolworths',      note: '' },
  { id: 12, date: '2025-04-15', desc: 'NRMA Insurance',           amt:  -120.00, cat: 'insurance',     payee: 'NRMA',            note: '' },
  { id: 13, date: '2025-04-16', desc: 'Coffee Works Cairns',      amt:   -18.50, cat: 'dining',        payee: 'Coffee Works',    note: '' },
  { id: 14, date: '2025-04-17', desc: 'Savings transfer',         amt:  -500.00, cat: 'savings',       payee: '',                note: '' },
  { id: 15, date: '2025-04-18', desc: 'Interest received',        amt:    12.40, cat: 'interest',      payee: 'Bank',            note: '' },
  { id: 16, date: '2025-04-19', desc: 'JB Hi-Fi Headphones',      amt:  -299.00, cat: 'assets',        payee: 'JB Hi-Fi',        note: 'Sony WH-1000XM5' },
  { id: 17, date: '2025-04-20', desc: 'Coles Supermarkets',       amt:   -98.75, cat: 'groceries',     payee: 'Coles',           note: '' },
  { id: 18, date: '2025-04-21', desc: 'Freelance payment',        amt:  1200.00, cat: 'freelance',     payee: 'Client Co',       note: 'Invoice #42' },
  { id: 19, date: '2025-04-22', desc: 'Uber',                     amt:   -24.50, cat: 'transport',     payee: 'Uber',            note: '' },
  { id: 20, date: '2025-04-23', desc: 'Bunnings Warehouse',       amt:  -156.80, cat: 'other',         payee: 'Bunnings',        note: '' },
];

// ── Default auto-categorisation rules ────────────────────────────────────────
// Each rule has:
//   id      – unique number
//   keyword – matched (case-insensitive) anywhere in the transaction description
//   catId   – category to assign (or empty string to skip category assignment)
//   payee   – payee to assign (or empty string to skip payee assignment)
// Rules are evaluated in order — the FIRST match wins.
export const DEFAULT_RULES = [
  { id: 1,  keyword: 'woolworths', catId: 'groceries',     payee: 'Woolworths' },
  { id: 2,  keyword: 'coles',      catId: 'groceries',     payee: 'Coles' },
  { id: 3,  keyword: 'uber eats',  catId: 'dining',        payee: 'Uber Eats' },
  { id: 4,  keyword: 'uber',       catId: 'transport',     payee: 'Uber' },
  { id: 5,  keyword: 'netflix',    catId: 'entertainment', payee: 'Netflix' },
  { id: 6,  keyword: 'translink',  catId: 'transport',     payee: 'Translink' },
  { id: 7,  keyword: 'salary',     catId: 'salary',        payee: '' },
  { id: 8,  keyword: 'ergon',      catId: 'utilities',     payee: 'Ergon Energy' },
  { id: 9,  keyword: 'nrma',       catId: 'insurance',     payee: 'NRMA' },
  { id: 10, keyword: 'chemist',    catId: 'health',        payee: 'Chemist Warehouse' },
];

// ── Default monthly budget targets (keyed by category id) ────────────────────
export const DEFAULT_BUDGETS = {
  groceries:     400,
  utilities:     250,
  rent_exp:     1800,
  transport:     100,
  dining:         80,
  entertainment:  50,
  health:        100,
  insurance:     120,
  other:         200,
};
