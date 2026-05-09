-- Migration 013: Add is_reversal flag to journal_lines
-- Reversal lines live in the SAME master ledger journal as original lines,
-- tagged with is_reversal=true so the GL can show them in red and net to zero.

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS is_reversal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS journal_lines_reversal 
  ON journal_lines(is_reversal) WHERE is_reversal = true;

-- Also ensure the source constraint includes 'reversal' (migration 012 may not have run)
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual','auto_category','import','reversal'));

-- Add missing columns if not present
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS ref        text,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz;
