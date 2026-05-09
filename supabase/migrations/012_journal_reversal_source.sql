-- Migration 012: Add 'reversal' to journal_entries source constraint
-- Also add status and ref columns used by the app but missing from schema.

-- Drop and recreate the CHECK constraint to include 'reversal'
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual','auto_category','import','reversal'));

-- Add status and ref columns if not present
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  ADD COLUMN IF NOT EXISTS ref        text,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz;
