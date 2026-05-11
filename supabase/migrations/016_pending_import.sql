-- Migration 016: pending_import flag for bank-feed transactions
-- Transactions fetched via basiq-sync land as pending_import = true
-- They become visible in the normal Transactions view only after the user
-- approves them in the Import Statement review screen (pending_import = false).

alter table transactions
  add column if not exists pending_import boolean not null default false;

-- Index for fast filtering
create index if not exists idx_transactions_pending_import
  on transactions(pending_import)
  where pending_import = true;

comment on column transactions.pending_import is
  'true = synced from bank feed but not yet approved by user in Import review';
