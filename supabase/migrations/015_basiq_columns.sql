-- Migration 015: Basiq bank connectivity columns
-- Run this in Supabase SQL Editor or via supabase db push

-- Organisations: store the Basiq user ID and last sync time
alter table organisations
  add column if not exists basiq_user_id    text,
  add column if not exists basiq_last_synced timestamptz;

-- Bank accounts: store the Basiq account ID so we can dedup on re-sync
alter table bank_accounts
  add column if not exists basiq_account_id  text,
  add column if not exists basiq_institution text;

-- Transactions: store the Basiq transaction ID for deduplication
-- import_hash already exists (migration 008) and handles this.
-- We also add basiq_txn_id for direct reference.
alter table transactions
  add column if not exists basiq_txn_id text;

-- Index for fast dedup lookups
create index if not exists idx_bank_accounts_basiq_id
  on bank_accounts(basiq_account_id)
  where basiq_account_id is not null;

create index if not exists idx_transactions_basiq_id
  on transactions(basiq_txn_id)
  where basiq_txn_id is not null;
