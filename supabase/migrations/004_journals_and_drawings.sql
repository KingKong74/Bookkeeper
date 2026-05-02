-- ============================================================
-- Migration: 004_journals_and_drawings.sql
-- Adds: journal voiding, journal→transactions link,
--       journal bank account link, Drawings category seed
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Journal enhancements ──────────────────────────────────────────────────────
alter table journal_entries
  add column if not exists status      text not null default 'posted'
    check (status in ('posted','void')),
  add column if not exists void_reason text,
  add column if not exists voided_at   timestamptz,
  add column if not exists account_id  uuid references bank_accounts(id) on delete set null,
  add column if not exists ref         text;

-- ── Link journal entries to transactions ─────────────────────────────────────
-- When a journal is posted, we create a transaction for the net amount
alter table transactions
  add column if not exists journal_entry_id uuid references journal_entries(id) on delete set null;

create index if not exists transactions_journal on transactions(journal_entry_id);

-- ── Add Drawings category ─────────────────────────────────────────────────────
-- This is a function so it can be called for existing orgs too
create or replace function seed_drawings_category(p_org_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into categories (org_id, label, colour, type, account_group, sort_order)
  values (p_org_id, 'Drawings', '#5F5E5A', 'equity', 'Owner accounts', 25)
  on conflict do nothing;
end;
$$;
