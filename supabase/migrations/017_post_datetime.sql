-- Migration 017: Store full post datetime for intraday transaction ordering
-- Basiq provides postDate as an ISO datetime (e.g. "2024-03-27T14:23:11Z")
-- We previously sliced to date-only, losing intraday ordering information.

alter table transactions
  add column if not exists post_datetime timestamptz;

-- Index for ordering within a day
create index if not exists idx_transactions_post_datetime
  on transactions(account_id, post_datetime)
  where post_datetime is not null;

comment on column transactions.post_datetime is
  'Full ISO datetime from Basiq postDate/transactionDate — used for intraday ordering';
