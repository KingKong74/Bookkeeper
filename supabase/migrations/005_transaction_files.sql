-- ============================================================
-- Migration: 005_transaction_files.sql
-- Adds transaction file attachments using Supabase Storage
-- Run in: Supabase Dashboard → SQL Editor
-- THEN: Supabase Dashboard → Storage → Create bucket "transaction-files" (public: false)
-- ============================================================

create table if not exists transaction_files (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organisations(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  filename       text not null,
  storage_path   text not null,   -- path in supabase storage bucket
  mime_type      text,
  size_bytes     bigint,
  uploaded_by    uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

alter table transaction_files enable row level security;

create policy "members can view files"
  on transaction_files for select using (org_id in (select my_org_ids()));
create policy "members can insert files"
  on transaction_files for insert with check (org_id in (select my_org_ids()));
create policy "members can delete files"
  on transaction_files for delete using (org_id in (select my_org_ids()));

create index transaction_files_txn on transaction_files(transaction_id);
