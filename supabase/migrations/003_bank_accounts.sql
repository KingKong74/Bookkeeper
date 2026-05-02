-- ============================================================
-- Migration: 003_bank_accounts.sql
-- Adds bank accounts table and links transactions to accounts.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Bank accounts ─────────────────────────────────────────────────────────────
create table bank_accounts (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references organisations(id) on delete cascade,
  name         text not null,                    -- e.g. "ANZ Everyday", "ANZ First CC"
  type         text not null default 'checking'  -- checking | savings | credit_card | loan | investment
                 check (type in ('checking','savings','credit_card','loan','investment')),
  currency     text not null default 'AUD',
  -- Credit card specific
  credit_limit numeric(12,2),                    -- null for non-CC accounts
  -- Opening balance (set manually, used for running balance calculations)
  opening_balance numeric(12,2) not null default 0,
  opening_date    date,
  is_active    boolean not null default true,
  colour       text not null default '#185FA5',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Link transactions to accounts ─────────────────────────────────────────────
alter table transactions
  add column if not exists account_id uuid references bank_accounts(id) on delete set null;

create index if not exists transactions_account on transactions(account_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table bank_accounts enable row level security;

create policy "members can view bank_accounts"
  on bank_accounts for select using (org_id in (select my_org_ids()));
create policy "members can insert bank_accounts"
  on bank_accounts for insert with check (org_id in (select my_org_ids()));
create policy "members can update bank_accounts"
  on bank_accounts for update using (org_id in (select my_org_ids()));
create policy "members can delete bank_accounts"
  on bank_accounts for delete using (org_id in (select my_org_ids()));

-- ── Updated_at trigger ────────────────────────────────────────────────────────
create trigger set_updated_at_bank_accounts
  before update on bank_accounts
  for each row execute function set_updated_at();
