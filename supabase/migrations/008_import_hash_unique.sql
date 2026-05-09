-- ============================================================
-- Migration 008: Fix import_hash uniqueness
-- Adds unique constraint so DB enforces dedup at the data layer,
-- not just client-side.
-- 
-- IMPORTANT: Run this AFTER clearing any existing duplicate hashes.
-- The script below deduplicates first, then adds the constraint.
-- ============================================================

-- Step 1: Remove any duplicate rows that share (org_id, import_hash)
-- Keep the row with the lowest created_at (first imported).
DELETE FROM transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY org_id, import_hash
             ORDER BY created_at ASC
           ) AS rn
    FROM transactions
    WHERE import_hash IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add unique constraint — DB now enforces dedup permanently
ALTER TABLE transactions
  ADD CONSTRAINT transactions_org_hash_unique
  UNIQUE (org_id, import_hash);

-- Step 3: Add index to support fast hash lookups by org
-- (the unique constraint creates an index, but we name it explicitly)
-- The constraint index covers this, so no extra index needed.
