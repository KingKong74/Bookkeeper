-- ================================================================
-- Migration 010: Rename categories table → accounts
-- The "categories" table IS the user's Chart of Accounts.
-- Renaming it to "accounts" makes the architecture clearer:
--   accounts   = org's live Chart of Accounts (user data)
--   master_coa = reference library (system data, 000-999)
-- ================================================================

-- Rename the table
ALTER TABLE categories RENAME TO accounts;

-- Rename the sequence/index names (PostgreSQL renames these automatically
-- but we rename the index we created explicitly)
ALTER INDEX IF EXISTS categories_parent RENAME TO accounts_parent;
ALTER INDEX IF EXISTS categories_code   RENAME TO accounts_code;

-- The RLS policy is on the table, recreate it
DROP POLICY IF EXISTS categories_select ON accounts;
DROP POLICY IF EXISTS categories_insert ON accounts;
DROP POLICY IF EXISTS categories_update ON accounts;
DROP POLICY IF EXISTS categories_delete ON accounts;

-- Recreate RLS policies under new table name
CREATE POLICY accounts_select ON accounts FOR SELECT USING (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);
CREATE POLICY accounts_insert ON accounts FOR INSERT WITH CHECK (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);
CREATE POLICY accounts_update ON accounts FOR UPDATE USING (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);
CREATE POLICY accounts_delete ON accounts FOR DELETE USING (
  org_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);

-- Create a compatibility view so old queries still work during transition
-- (safe to drop once all code is updated)
CREATE OR REPLACE VIEW categories AS SELECT * FROM accounts;

-- Note: FK constraints on transactions.category_id, auto_cat_rules.category_id,
-- and budgets.category_id still reference the column correctly since PostgreSQL
-- tracks FKs by OID, not table name. The column name category_id stays the same.
