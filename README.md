# Moniqr — Personal & Business Accounting

A double-entry personal accounting app built with React + Vite, backed by Supabase. Handles bank transaction categorisation, auto-cat rules, journals, financial statements (P&L, Balance Sheet, Trial Balance), budgets, and tax tracking.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # run 1002 tests once
npm run test:watch # watch mode
npm run build      # production build
```

### Environment

Create `.env.local` at the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Database

Run migrations in order from `supabase/migrations/`. The app will error on first load if no organisation row exists — the migrations create the required schema.

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 + Vite 8 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Styling | Custom CSS (`src/styles/main.css`) — no Tailwind |
| Testing | Vitest 4 — 1002 tests across 26 files |

---

## Project structure

```
src/
├── App.jsx                        # Root — auth gate, routing, shell layout
├── main.jsx                       # React entry point
├── styles/
│   └── main.css                   # All global styles and CSS variables
│
├── context/
│   └── AppContext.jsx             # Global state — auth, data, date range, toast
│
├── lib/
│   ├── supabase.js                # Supabase client + all direct DB calls
│   └── audit.js                  # Audit trail logging helper
│
├── services/                      # Thin wrappers over lib/supabase.js
│   ├── authService.js             # signIn, signUp, signOut, getMyOrgs
│   ├── bankService.js             # fetchBankAccounts, create/update/delete
│   ├── categoryService.js         # categories, payees, auto-cat rules
│   ├── journalService.js          # journals + postCategoryJournal
│   ├── reportService.js           # fetchJournalLines for reports
│   └── transactionService.js      # fetchTransactions, create, update, delete, bulkImport
│
├── utils/
│   ├── helpers.js                 # filterByDateRange, fmt, buildPLFromJournals, buildBSFromJournals, etc.
│   ├── currency.js                # fmt, fmtSigned, fmtAcct, parseCurrency
│   ├── dates.js                   # fyLabel, fyDateRange, parseCSVDate, getPriorPeriod
│   ├── csvParser.js               # CSV -> transaction rows
│   ├── pdfParser.js               # PDF bank statement parser
│   ├── journalMath.js             # buildJournalLines, buildReversalLines, isTBBalanced
│   ├── merchant.js                # extractMerchantName
│   └── taxEngine.js               # ATO tax calculations
│
├── hooks/
│   ├── useAuth.js                 # Auth state hook
│   ├── useCollapsible.js          # Open/close state for panels
│   ├── useLocalStorage.js         # Persisted local state
│   ├── useOrganisation.js         # Organisation selection
│   ├── useSessionPref.js          # Session-scoped preferences (no persistence)
│   ├── useTheme.js                # Dark/light mode
│   └── useTransactions.js         # Transaction filtering and sorting
│
├── components/
│   ├── RuleBuilderModal.jsx        # Shared auto-cat rule modal
│   ├── layout/
│   │   └── Sidebar.jsx            # Navigation sidebar with badge counts
│   └── ui/
│       ├── index.jsx              # Toast, MetricCard, PayeeAvatar, BalanceAlert
│       └── PeriodBar.jsx          # Date range selector shown above reports/views
│
├── data/
│   └── seeds.js                   # Seed data for development
│
└── views/
    ├── Auth.jsx                   # Login / sign-up screen
    ├── Dashboard.jsx              # Overview with metrics, recent txns, quick actions
    │
    ├── Accounting/
    │   ├── index.jsx              # Barrel: re-exports ChartOfAccounts, Journals, Categories,
    │   │                          #         AutoCatRules, Budgets
    │   ├── Categories.jsx         # Simple category CRUD
    │   ├── AutoCatRules.jsx       # Auto-categorisation rule editor (drag to reorder)
    │   ├── Budgets.jsx            # Monthly budget vs actual by expense category
    │   ├── ChartOfAccounts.jsx    # Re-export stub -> ChartOfAccounts/index.jsx
    │   ├── Journals.jsx           # Re-export stub -> Journals/index.jsx
    │   │
    │   ├── ChartOfAccounts/       # COA — split because it's complex
    │   │   ├── index.jsx          # Page orchestrator: toolbar, layout, modal wiring
    │   │   ├── useCOA.js          # All COA state and operations (hook)
    │   │   ├── coaData.js         # Static COA templates: Personal, Company, Trust
    │   │   ├── COATable.jsx       # BankAccountsSection + COATypeSection table rows
    │   │   ├── COADrillPanel.jsx  # Slide-out: transactions for a selected account
    │   │   └── COAModals.jsx      # SeedModal, MasterCOABrowser, DeactivateModal,
    │   │                          #   HardDeleteModal, EditAccountModal
    │   │
    │   └── Journals/              # Double-entry journals — split because it's complex
    │       ├── index.jsx          # Page orchestrator: tabs, entry form, post/void
    │       ├── journalHelpers.js  # consolidateLines() — pure function, no React
    │       ├── GeneralLedger.jsx  # GL view: consolidated balances, expandable lines
    │       └── JournalList.jsx    # Journal entries list with expandable DR/CR detail
    │
    ├── Banking/
    │   ├── AddTransactionModal.jsx # Manual transaction entry
    │   ├── AutoCategorise.jsx     # Batch auto-cat review and approval
    │   ├── BankAccounts.jsx       # Bank account management
    │   ├── ImportStatement.jsx    # CSV/PDF import with duplicate detection
    │   ├── Reconciliation.jsx     # Account reconciliation against statements
    │   ├── TransactionModal.jsx   # Transaction detail/edit slide-out
    │   ├── Transactions.jsx       # Re-export stub -> Banking/Transactions/index.jsx
    │   │
    │   └── Transactions/          # Main transaction table — split for size
    │       ├── index.jsx          # Page orchestrator: state, handlers, data flow
    │       ├── TransactionFilters.jsx  # Account tabs, recon panel, alloc tabs,
    │       │                          #   search bar, bulk actions dropdown
    │       ├── TransactionRow.jsx      # Single <tr> component
    │       ├── InlineCatPicker.jsx     # Always-visible category picker (keyboard nav,
    │       │                          #   grouped by type, create-on-the-fly)
    │       ├── InlinePayeePicker.jsx   # Always-visible payee picker (create-on-the-fly)
    │       ├── InlineDescEditor.jsx    # Click-to-edit description field
    │       ├── DeleteToast.jsx         # Bottom-of-screen delete confirmation toast
    │       ├── MakeRulePrompt.jsx      # Prompt after repeated manual categorisation
    │       └── transactionHelpers.js   # Suppression store (localStorage-backed)
    │
    ├── Reports/
    │   ├── index.jsx              # Barrel: re-exports TrialBalance, ProfitAndLoss,
    │   │                          #         BalanceSheet, PayeeReport
    │   ├── reportHelpers.js       # Pure helpers: priorPeriod, getPriorDates,
    │   │                          #   addSyntheticParents, buildByPayee, subCodeLabel
    │   ├── reportComponents.jsx   # Shared display: A4Paper, StRow, StGroupTotal,
    │   │                          #   StTotal, StGrand, CompareBar, BSRow, BSTotalRow
    │   ├── DrillPanel.jsx         # Slide-out / pop-out drill with inline re-cat
    │   ├── TrialBalance.jsx       # Trial Balance (journal-based with txn fallback)
    │   ├── ProfitAndLoss.jsx      # P&L with comparison + sub-account grouping
    │   ├── BalanceSheet.jsx       # BS — standard two-col and Xero-style detailed
    │   ├── PayeeReport.jsx        # Payee summary: spend, income, counts, edit/delete
    │   └── AuditTrailReport.jsx   # Audit log viewer
    │
    ├── Settings/
    │   └── index.jsx              # App settings: dark mode, FY, org name, merchant intel
    │
    └── Tax/
        └── TaxTracker.jsx         # ATO tax estimate and deduction tracking
```

---

## How the app is wired

### Auth and data flow

```
Supabase Auth
      |
      v
AppContext  (src/context/AppContext.jsx)
  - loads all data on sign-in via Promise.all (transactions, categories,
    journals, accounts, payees, rules, budgets, tax, masterCOA, ...)
  - re-fetches transactions when date range changes
  - quiet background refresh on view tab switch
  - exposes everything via useApp()
      |
      v
  views and components  (all use useApp() to read state)
```

### Field naming: DB vs views

The DB uses `snake_case`. AppContext normalises each transaction on load so both names work:

| DB column | View shorthand | Notes |
|---|---|---|
| `category_id` | `cat` | UUID string |
| `description` | `desc` | |
| `amount` | `amt` | parsed as float |
| `payees.name` | `payee` | joined relation |

Category objects are also normalised:

| DB column | View shorthand |
|---|---|
| `label` | `l` |
| `type` | `t` |
| `colour` | `col` |
| `account_group` | `ac` |

### catMap

`catMap` in context is `{ [uuid]: categoryObject }`. Views look categories up as `catMap[t.cat]` since `t.cat` is the `category_id` UUID. `catMap` is computed fresh each render from the `categories` array.

---

## Key architectural decisions

**No `features/` directory.** Everything lives under `views/`, mirroring the navigation structure. Complex views that need multiple files get a subfolder. Simple views are single files.

**Barrel re-exports at the section level.** `views/Accounting/index.jsx` and `views/Reports/index.jsx` are clean barrels. `App.jsx` imports from those, never reaching into subfolders directly.

**Stub re-exports for backward compat.** `Banking/Transactions.jsx`, `Accounting/ChartOfAccounts.jsx`, and `Accounting/Journals.jsx` are one-line re-exports pointing to their subfolder `index.jsx`. Nothing that imports those paths needs to change.

**Double-entry accounting.** Every categorisation automatically posts a journal entry via `postCategoryJournal()`. Reports prefer journal-based data and gracefully fall back to transaction totals when no journals exist yet.

**Optimistic UI throughout.** `allocateCat`, `allocatePayee`, and `bulkAllocate` update local React state immediately, then fire DB writes in the background. The UI never blocks on a network round-trip.

**Pure helpers in dedicated files.** `reportHelpers.js`, `journalHelpers.js`, and `transactionHelpers.js` contain no React. They're importable and testable in isolation.

---

## Services layer

Import from services, not from `lib/supabase.js` directly.

```
services/authService.js
  signIn(email, password)
  signUp(email, password)
  signOut()
  getMyOrgs()

services/transactionService.js
  fetchTransactions(orgId, dateFrom, dateTo)
  createTransaction(orgId, data)
  updateTransaction(id, updates)
  deleteTransaction(id)
  bulkImportTransactions(orgId, rows)

services/categoryService.js
  fetchCategories(orgId)
  fetchPayees(orgId)
  fetchRules(orgId)
  upsertPayee(orgId, name, colour)
  deletePayee(payeeId)
  createRule(orgId, data)
  updateRule(id, data)
  deleteRule(id)

services/journalService.js
  fetchJournals(orgId)
  postCategoryJournal(orgId, transaction, category, account)
  batchPost(orgId, transactions, catMap, accountMap)
  createJournalEntry(orgId, data)

services/bankService.js
  fetchBankAccounts(orgId)
  createBankAccount(orgId, data)
  updateBankAccount(id, data)
  deleteBankAccount(id)

services/reportService.js
  fetchJournalLinesForPeriod(orgId, from, to)
  fetchAllJournalLines(orgId)
```

---

## Views reference

| View key in App.jsx | Component imported | What it shows |
|---|---|---|
| `dashboard` | `Dashboard` | Metrics, recent transactions, quick actions |
| `transactions` | `Transactions` | Main transaction table with inline editing |
| `approve` | `AutoCategorise` | Batch review of auto-cat suggestions |
| `import` | `ImportStatement` | CSV/PDF bank statement import |
| `accounts` | `BankAccounts` | Bank account management |
| `reconcile` | `Reconciliation` | Statement reconciliation |
| `journals` | `Journals` | Double-entry journal entries + GL |
| `coa` | `ChartOfAccounts` | Chart of accounts with template seeding |
| `categories` | `Categories` | Category CRUD |
| `rules` | `AutoCatRules` | Auto-cat rules (drag to reorder) |
| `budgets` | `Budgets` | Budget vs actual by category |
| `tax` | `TaxTracker` | ATO tax estimate + deduction tracking |
| `auditlog` | `AuditTrailReport` | Audit trail log |
| `trial` | `TrialBalance` | Trial Balance |
| `pl` | `ProfitAndLoss` | Profit & Loss |
| `balance` | `BalanceSheet` | Balance Sheet |
| `payees` | `PayeeReport` | Payee report |

---

## Testing

```bash
npm test              # 1002 tests, ~6s
npm run test:watch    # watch mode for TDD
```

Tests live in `src/__tests__/`. They are source-reading tests — they scan the actual source file content for key strings and patterns rather than rendering components. This makes them fast, side-effect-free, and easy to read.

| Test file | What it covers |
|---|---|
| `features.test.js` | Presence of key features across all view files |
| `unit.transactions_features.test.js` | Transaction table: bulk actions, optimistic UI, drill panel |
| `unit.coa_payee.test.js` | COA edit/type-change/code validation, payee report state |
| `unit.bulk_payee_rules.test.js` | Bulk categorise, payee assignment, auto-cat rules |
| `unit.doubleentry.test.js` | Journal math, TB balance, P&L, BS calculations |
| `unit.currency.test.js` | `fmt`, `fmtSigned`, `parseCurrency` |
| `unit.dates.test.js` | FY date helpers |
| `unit.helpers.test.js` | `filterByDateRange`, `runAutoCatRules` |
| `unit.import.test.js` | CSV parser |
| `unit.merchant.test.js` | `extractMerchantName` |
| `unit.services.test.js` | Service function shape tests |
| `integration.imports.test.js` | All imports resolve without errors |
| `scenarios.test.js` | End-to-end data flow scenarios |
| `unit.speed.test.js` | Performance: large dataset handling |

---

## Database migrations

Run in order from `supabase/migrations/`. Each file is additive.

| File | What it adds |
|---|---|
| `001_initial_schema.sql` | organisations, transactions, categories, payees, rules |
| `002_audit_trail.sql` | audit_log table |
| `003_bank_accounts.sql` | bank_accounts table |
| `005_transaction_files.sql` | Import file tracking |
| `006_double_entry.sql` | journals, journal_lines tables |
| `007_merchant_hints.sql` | merchant_hints for AI categorisation |
| `008_import_hash_unique.sql` | Unique constraint on import hash for deduplication |
| `013_journal_reversal_lines.sql` | `is_reversal` flag on journal lines |
| `014_rule_conditions.sql` | `amt_exact`, `amt_min`, `amt_max`, `direction` on rules |
| `015_basiq_columns.sql` | Basiq open banking fields |

---

## CSS conventions

All styles in `src/styles/main.css`. No CSS modules, no Tailwind.

**Key CSS variables** (overridden in `[data-theme="dark"]`):

```
--sand        page background (warm off-white)
--sand2       slightly darker background
--ink         primary text
--stone       secondary / muted text
--stone2      tertiary text
--bd          border (light)
--bd2         border (stronger)
--a           accent colour (#BA7517 amber)
--a2          accent text colour
--al          accent background tint
--ab          accent background stronger
--gn          green — positive values (var(--gn))
--gnb         green background tint
--rd          red — negative values
--rdb         red background tint
--rr          border-radius small
--rl          border-radius large
--font-sans   system font stack
```

**Utility classes**:

```
.vp           positive value colour (green)
.vn           negative value colour (red)
.va           accent value colour (amber)
.tr           text-align: right
.card         rounded card with shadow and background
.ch           card header (flex row)
.ch-r         card header right side
.btn          default button
.btn-a        accent (amber) filled button
.btn-sm       small button
.btn-ghost    icon/text ghost button
.metrics      flex row of MetricCard components
.modal-bg     full-screen modal overlay
.modal        modal container
.field        form field wrapper (label + input)
.cpill        category pill chip
.cdot         category colour dot
```

---

## Architecture

```
App.jsx (auth gate + view router)
  |
  +-- AppContext (global state via useApp())
  |     |
  |     +-- services/ (thin DB wrappers)
  |     |     |
  |     |     +-- lib/supabase.js (Supabase client)
  |     |
  |     +-- utils/ (pure helpers, no React)
  |     +-- hooks/ (reusable React state)
  |
  +-- views/ (one file or subfolder per page)
  |     |
  |     +-- Accounting/, Banking/, Reports/, Settings/, Tax/
  |
  +-- components/ (shared UI: Sidebar, Toast, PeriodBar, etc.)
```

All views read state from `useApp()`. They never import from `lib/supabase.js` directly — they go through `services/` for DB writes and receive read data from context.

---

## Deployment

The app is a standard Vite SPA and deploys to any static host.

**Netlify (recommended):**

1. Connect your repo to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Set environment variables in Netlify dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

**Other hosts (Vercel, Cloudflare Pages, S3):** same build command and env vars. Add a redirect rule so all paths serve `index.html` (required for client-side routing).

For Netlify add a `public/_redirects` file:
```
/*  /index.html  200
```
