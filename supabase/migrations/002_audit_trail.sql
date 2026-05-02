-- ============================================================
-- Migration: 002_audit_trail.sql
-- Adds transaction audit log table.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

create table transaction_audit (
  id             uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null,           -- references transactions(id) — not FK so log survives deletion
  org_id         uuid not null references organisations(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  action         text not null            -- 'created' | 'updated' | 'deleted' | 'imported' | 'category_changed' | 'payee_changed'
                   check (action in ('created','updated','deleted','imported','category_changed','payee_changed','unallocated')),
  changed_fields jsonb,                   -- { field: { from: x, to: y } }
  snapshot       jsonb,                   -- full transaction snapshot at time of change
  note           text,                    -- optional human note (e.g. "Manual correction")
  created_at     timestamptz not null default now()
);

-- Index for fetching audit history for a specific transaction
create index audit_by_transaction on transaction_audit(transaction_id, created_at desc);
create index audit_by_org         on transaction_audit(org_id, created_at desc);

-- RLS
alter table transaction_audit enable row level security;

create policy "members can view audit log"
  on transaction_audit for select
  using (org_id in (select my_org_ids()));

create policy "members can insert audit log"
  on transaction_audit for insert
  with check (org_id in (select my_org_ids()));

-- No update/delete on audit log — it's append-only
