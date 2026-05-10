-- Migration: add amount conditions and direction to auto_cat_rules
-- These columns enable "match only transactions of $49.95" type rules.
alter table auto_cat_rules
  add column if not exists amt_exact  numeric(12,2),
  add column if not exists amt_min    numeric(12,2),
  add column if not exists amt_max    numeric(12,2),
  add column if not exists direction  text check (direction in ('in','out','') or direction is null);
