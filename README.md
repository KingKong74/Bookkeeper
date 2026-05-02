# Ledger — Personal Accounting App

A React + Vite personal accounting application.

## Getting started

```bash
# Install dependencies (first time only)
npm install

# Start the development server
npm run dev
```

Then open http://localhost:5173 in your browser.

## Build for production

```bash
npm run build
```

Output goes to `dist/` — open `dist/index.html` directly or serve it with any static host.

## Project structure

```
src/
├── main.jsx                    # Entry point — mounts React + AppProvider
├── App.jsx                     # Root component — layout + view routing
│
├── context/
│   └── AppContext.jsx           # Global state (transactions, categories, etc.)
│
├── data/
│   └── seeds.js                # Default data loaded on first run
│
├── hooks/
│   └── useLocalStorage.js      # useState that persists to localStorage
│
├── utils/
│   ├── helpers.js              # Formatting, date, accounting calculations
│   └── csvParser.js            # CSV bank statement parser
│
├── components/
│   ├── layout/
│   │   └── Sidebar.jsx         # Left navigation sidebar
│   └── ui/
│       ├── index.jsx           # Button, Badge, CategoryPill, PayeeAvatar, Toast, etc.
│       └── PeriodBar.jsx       # Date range picker with FY shortcuts
│
├── views/
│   ├── Dashboard.jsx           # Home screen — KPIs, recent transactions, insights
│   ├── Banking/
│   │   ├── Transactions.jsx    # Transaction list with allocation + payee assignment
│   │   ├── TransactionModal.jsx# Edit modal, CategoryDropdown, PayeeDropdown
│   │   ├── AutoCategorise.jsx  # Approval queue for auto-cat suggestions
│   │   ├── ImportStatement.jsx # CSV importer with column mapping
│   │   └── Reconciliation.jsx  # Matched vs unmatched status
│   ├── Accounting/
│   │   └── index.jsx           # Categories, Rules, Budgets, Journals, COA
│   └── Reports/
│       └── index.jsx           # Trial Balance, P&L, Balance Sheet, Payee Report
│
└── styles/
    └── main.css                # All styles — design tokens, layout, components
```

## Data persistence

All data is saved automatically to `localStorage` in your browser.
To reset to the sample data, open DevTools → Application → Local Storage → clear all `ledger_*` keys.

## Financial year

Defaults to the current Australian financial year (July 1 – June 30).
Use the date picker on any report or banking view to change the period.
