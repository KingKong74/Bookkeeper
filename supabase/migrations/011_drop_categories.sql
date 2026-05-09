-- ================================================================
-- Migration 011: Drop categories table
-- Run AFTER migration 010 (rename categories → accounts).
-- 
-- After 010, "categories" is a VIEW pointing to "accounts".
-- This migration drops that compatibility view.
-- 
-- If 010 has NOT been run yet (table still called categories),
-- this migration renames it to accounts first, then drops the view.
-- ================================================================

-- Case 1: If categories is still a TABLE (010 not run), rename it first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'categories' AND table_type = 'BASE TABLE'
  ) THEN
    -- Run the rename inline
    ALTER TABLE categories RENAME TO accounts;
    ALTER INDEX IF EXISTS categories_parent RENAME TO accounts_parent;
    ALTER INDEX IF EXISTS categories_code   RENAME TO accounts_code;

    -- Fix RLS
    DROP POLICY IF EXISTS "members can view categories"  ON accounts;
    DROP POLICY IF EXISTS "members can insert categories" ON accounts;
    DROP POLICY IF EXISTS "members can update categories" ON accounts;
    DROP POLICY IF EXISTS "members can delete categories" ON accounts;

    CREATE POLICY "members can view accounts"
      ON accounts FOR SELECT USING (org_id IN (SELECT my_org_ids()));
    CREATE POLICY "members can insert accounts"
      ON accounts FOR INSERT WITH CHECK (org_id IN (SELECT my_org_ids()));
    CREATE POLICY "members can update accounts"
      ON accounts FOR UPDATE USING (org_id IN (SELECT my_org_ids()));
    CREATE POLICY "members can delete accounts"
      ON accounts FOR DELETE USING (org_id IN (SELECT my_org_ids()));
  END IF;
END $$;

-- Case 2: Drop the compatibility VIEW if it exists
DROP VIEW IF EXISTS categories;

-- Ensure accounts table has all needed columns
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS code       text,
  ADD COLUMN IF NOT EXISTS parent_id  uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS accounts_parent ON accounts(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_code   ON accounts(org_id, code);

-- Drop NOT NULL constraints so accounts can be "cleared" (like master_coa placeholder slots)
ALTER TABLE accounts ALTER COLUMN label  DROP NOT NULL;
ALTER TABLE accounts ALTER COLUMN type   DROP NOT NULL;
-- colour stays NOT NULL (has default '#888780')
