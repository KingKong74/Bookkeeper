-- ============================================================
-- Migration 006: Double-Entry Accounting Infrastructure
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Link journal entries back to the source transaction
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'manual'   -- 'manual' | 'auto_category' | 'import'
  CHECK (source IN ('manual','auto_category','import'));

CREATE INDEX IF NOT EXISTS journal_entries_transaction
  ON journal_entries(transaction_id) WHERE transaction_id IS NOT NULL;

-- 2. Link transactions to the journal entry they generated
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_journal_entry
  ON transactions(journal_entry_id) WHERE journal_entry_id IS NOT NULL;

-- 3. Account codes + suspense flag on categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS code       TEXT,        -- e.g. '1-0001', '2-0001', '5-0001'
  ADD COLUMN IF NOT EXISTS is_suspense BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Seed a suspense category if none exists (used for unlinked transactions)
--    This is idempotent — skipped if it already exists.
DO $$
DECLARE v_org UUID;
BEGIN
  FOR v_org IN SELECT id FROM organisations LOOP
    IF NOT EXISTS (
      SELECT 1 FROM categories
      WHERE org_id = v_org AND is_suspense = TRUE
    ) THEN
      INSERT INTO categories
        (org_id, label, type, account_group, colour, is_suspense, sort_order)
      VALUES
        (v_org, 'Suspense / Clearing', 'asset', 'Suspense', '#888780', TRUE, 9999);
    END IF;
  END LOOP;
END $$;

-- 5. Add source tracking to journal_lines (which bank account or category)
ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS category_id    UUID REFERENCES categories(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;
