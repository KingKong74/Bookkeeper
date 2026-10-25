-- ============================================================
-- Migration 018: Self-host bootstrap
-- Captures objects that were created by hand in the hosted
-- Supabase dashboard, so a fresh database works end to end:
--   1. Seed functions repointed from categories → accounts (011 dropped categories)
--   2. on_auth_user_created trigger: new user → personal org + default accounts/rules
--   3. "transaction-files" storage bucket + RLS on storage.objects
-- ============================================================


-- ── 1. Seed functions now write to accounts ──────────────────
create or replace function seed_default_categories(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into accounts (org_id, label, colour, type, account_group, sort_order) values
    (p_org_id, 'Salary',           '#3B6D11', 'income',    'Revenue',         1),
    (p_org_id, 'Interest received','#1D9E75', 'income',    'Revenue',         2),
    (p_org_id, 'Freelance income', '#639922', 'income',    'Revenue',         3),
    (p_org_id, 'Rental income',    '#085041', 'income',    'Revenue',         4),
    (p_org_id, 'Groceries',        '#BA7517', 'expense',   'Living expenses', 10),
    (p_org_id, 'Utilities',        '#854F0B', 'expense',   'Utilities',       11),
    (p_org_id, 'Rent / mortgage',  '#993C1D', 'expense',   'Housing',         12),
    (p_org_id, 'Transport',        '#185FA5', 'expense',   'Transport',       13),
    (p_org_id, 'Dining & café',    '#D4537E', 'expense',   'Entertainment',   14),
    (p_org_id, 'Entertainment',    '#7F77DD', 'expense',   'Entertainment',   15),
    (p_org_id, 'Health',           '#0F6E56', 'expense',   'Health',          16),
    (p_org_id, 'Insurance',        '#534AB7', 'expense',   'Insurance',       17),
    (p_org_id, 'Savings transfer', '#5F5E5A', 'equity',    'Savings',         20),
    (p_org_id, 'Asset purchase',   '#444441', 'asset',     'Fixed assets',    21),
    (p_org_id, 'Loan repayment',   '#E24B4A', 'liability', 'Liabilities',     22),
    (p_org_id, 'Other',            '#888780', 'expense',   'Miscellaneous',   99);
end;
$$;

create or replace function seed_drawings_category(p_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into accounts (org_id, label, colour, type, account_group, sort_order)
  values (p_org_id, 'Drawings', '#5F5E5A', 'equity', 'Owner accounts', 25)
  on conflict do nothing;
end;
$$;

create or replace function seed_default_rules(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into auto_cat_rules (org_id, keyword, category_id, payee_name, sort_order)
  select
    p_org_id,
    r.keyword,
    a.id,
    r.payee_name,
    r.sort_order
  from (values
    ('woolworths', 'Groceries',        'Woolworths',       1),
    ('coles',      'Groceries',        'Coles',            2),
    ('aldi',       'Groceries',        'Aldi',             3),
    ('uber eats',  'Dining & café',    'Uber Eats',        4),
    ('doordash',   'Dining & café',    'DoorDash',         5),
    ('uber',       'Transport',        'Uber',             6),
    ('netflix',    'Entertainment',    'Netflix',          7),
    ('spotify',    'Entertainment',    'Spotify',          8),
    ('translink',  'Transport',        'Translink',        9),
    ('salary',     'Salary',           null,               10),
    ('ergon',      'Utilities',        'Ergon Energy',     11),
    ('origin',     'Utilities',        'Origin Energy',    12),
    ('nrma',       'Insurance',        'NRMA',             13),
    ('chemist',    'Health',           'Chemist Warehouse',14),
    ('medicare',   'Health',           'Medicare',         15)
  ) as r(keyword, cat_label, payee_name, sort_order)
  join accounts a on a.org_id = p_org_id and a.label = r.cat_label;
end;
$$;


-- ── 2. New-user trigger ──────────────────────────────────────
-- signUp() passes display_name in user metadata (src/lib/supabase.js).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  new_org_id := create_personal_org(
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Personal')
  );
  perform seed_default_categories(new_org_id);
  perform seed_drawings_category(new_org_id);
  perform seed_default_rules(new_org_id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ── 3. Transaction file storage ──────────────────────────────
-- Objects are stored as {org_id}/{txn_id}/{file} (uploadTransactionFile).
insert into storage.buckets (id, name, public)
values ('transaction-files', 'transaction-files', false)
on conflict (id) do nothing;

drop policy if exists "members read org files"   on storage.objects;
drop policy if exists "members upload org files" on storage.objects;
drop policy if exists "members delete org files" on storage.objects;

create policy "members read org files" on storage.objects for select using (
  bucket_id = 'transaction-files'
  and (storage.foldername(name))[1]::uuid in (select my_org_ids())
);
create policy "members upload org files" on storage.objects for insert with check (
  bucket_id = 'transaction-files'
  and (storage.foldername(name))[1]::uuid in (select my_org_ids())
);
create policy "members delete org files" on storage.objects for delete using (
  bucket_id = 'transaction-files'
  and (storage.foldername(name))[1]::uuid in (select my_org_ids())
);


-- ── 4. Non-recursive memberships policy ──────────────────────
-- The 001 policy subqueries memberships from inside its own policy, which
-- Postgres rejects ("infinite recursion detected in policy"). Resolve the
-- owner lookup in a security definer function instead, like my_org_ids().
create or replace function my_owned_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from memberships where user_id = auth.uid() and role = 'owner';
$$;

drop policy if exists "users can view their own memberships" on memberships;
create policy "users can view their own memberships"
  on memberships for select
  using (user_id = auth.uid() or org_id in (select my_owned_org_ids()));
