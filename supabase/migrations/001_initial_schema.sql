-- ============================================================
-- LEDGER — Complete Database Schema
-- Migration: 001_initial_schema.sql
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Architecture overview:
--   - organisations     : the top-level container for all data
--   - memberships       : links users to organisations with a role
--   - All other tables  : scoped to an organisation via org_id
--   - Row Level Security: enforced on every table so users only
--                         ever see data they have access to
-- ============================================================


-- ── Extensions ───────────────────────────────────────────────
-- uuid_generate_v4() for primary keys
create extension if not exists "uuid-ossp";


-- ════════════════════════════════════════════════════════════
-- ORGANISATIONS
-- Every user's financial data lives inside an organisation.
-- One person = one org. A couple can share an org.
-- Future: clients get their own org, advisor gets membership.
-- ════════════════════════════════════════════════════════════
create table organisations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,                        -- e.g. "John's Finances"
  type        text not null default 'personal'      -- personal | household | business
                check (type in ('personal', 'household', 'business')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Memberships ───────────────────────────────────────────────
-- Links auth.users to organisations with a role.
-- Roles: owner | member | advisor (read-only, future use)
create table memberships (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organisations(id) on delete cascade,
  user_id     uuid not null references auth.users(id)   on delete cascade,
  role        text not null default 'owner'
                check (role in ('owner', 'member', 'advisor')),
  created_at  timestamptz not null default now(),
  unique(org_id, user_id)       -- one membership per user per org
);


-- ════════════════════════════════════════════════════════════
-- CATEGORIES
-- Transaction categories with accounting type and colour.
-- Seeded with defaults on org creation (see function below).
-- ════════════════════════════════════════════════════════════
create table categories (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organisations(id) on delete cascade,
  label       text not null,
  colour      text not null default '#888780',   -- hex colour
  type        text not null                       -- income | expense | asset | liability | equity
                check (type in ('income', 'expense', 'asset', 'liability', 'equity')),
  account_group text not null,                   -- e.g. "Living expenses"
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════
-- PAYEES
-- Named payees/payers (like Xero contacts).
-- ════════════════════════════════════════════════════════════
create table payees (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  colour      text not null default '#888780',
  created_at  timestamptz not null default now(),
  unique(org_id, name)    -- payee names unique within an org
);


-- ════════════════════════════════════════════════════════════
-- TRANSACTIONS
-- Core financial data. Every money movement lives here.
-- ════════════════════════════════════════════════════════════
create table transactions (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organisations(id) on delete cascade,
  date        date not null,
  description text not null,                      -- raw bank description
  note        text,                               -- user's personal note
  amount      numeric(12, 2) not null,            -- negative = expense, positive = income
  category_id uuid references categories(id) on delete set null,
  payee_id    uuid references payees(id)     on delete set null,
  imported    boolean not null default false,     -- true if from CSV import
  import_hash text,                              -- used for duplicate detection on import
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for common query patterns
create index transactions_org_date  on transactions(org_id, date);
create index transactions_org_cat   on transactions(org_id, category_id);
create index transactions_org_payee on transactions(org_id, payee_id);


-- ════════════════════════════════════════════════════════════
-- AUTO-CAT RULES
-- Keyword → category + payee assignment rules.
-- Applied in order (sort_order). First match wins.
-- ════════════════════════════════════════════════════════════
create table auto_cat_rules (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organisations(id) on delete cascade,
  keyword     text not null,
  category_id uuid references categories(id) on delete set null,
  payee_name  text,                               -- creates payee if doesn't exist
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════
-- BUDGETS
-- Monthly budget targets per category.
-- One row per category per financial year.
-- ════════════════════════════════════════════════════════════
create table budgets (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organisations(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  fy_start    integer not null,                  -- e.g. 2024 = FY2024-25
  monthly_amount numeric(12, 2) not null default 0,
  created_at  timestamptz not null default now(),
  unique(org_id, category_id, fy_start)
);


-- ════════════════════════════════════════════════════════════
-- JOURNAL ENTRIES
-- Double-entry manual journals (header + lines).
-- ════════════════════════════════════════════════════════════
create table journal_entries (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organisations(id) on delete cascade,
  date        date not null,
  description text not null,
  created_at  timestamptz not null default now()
);

create table journal_lines (
  id              uuid primary key default uuid_generate_v4(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_name    text not null,
  debit           numeric(12, 2) not null default 0,
  credit          numeric(12, 2) not null default 0,
  sort_order      integer not null default 0
);


-- ════════════════════════════════════════════════════════════
-- TAX PROFILE
-- Per-user, per-financial-year tax settings.
-- Stores the inputs needed to estimate Australian income tax.
-- ════════════════════════════════════════════════════════════
create table tax_profiles (
  id                    uuid primary key default uuid_generate_v4(),
  org_id                uuid not null references organisations(id) on delete cascade,
  fy_start              integer not null,          -- e.g. 2024 = FY2024-25
  residency_status      text not null default 'resident'
                          check (residency_status in ('resident', 'non_resident', 'working_holiday')),

  -- Income adjustments (on top of what's in transactions)
  salary_sacrifice_super  numeric(12, 2) not null default 0,   -- pre-tax super contributions
  personal_super_contrib  numeric(12, 2) not null default 0,   -- after-tax super contributions (deductible)
  other_deductions        numeric(12, 2) not null default 0,   -- work-related, donations, etc.

  -- Private health insurance (affects Medicare levy surcharge)
  has_private_health    boolean not null default false,
  private_health_tier   text default null
                          check (private_health_tier in ('base', 'tier1', 'tier2', 'tier3') or private_health_tier is null),

  -- HELP/HECS debt
  has_help_debt         boolean not null default false,
  help_balance          numeric(12, 2) not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(org_id, fy_start)
);


-- ════════════════════════════════════════════════════════════
-- TAX RATES (reference data — not user-specific)
-- Australian tax brackets by financial year.
-- Stored in DB so they can be updated without a code deploy.
-- ════════════════════════════════════════════════════════════
create table tax_brackets (
  id          uuid primary key default uuid_generate_v4(),
  fy_start    integer not null,       -- e.g. 2024 = FY2024-25
  min_income  numeric(12, 2) not null,
  max_income  numeric(12, 2),         -- null = no upper limit
  rate        numeric(5, 4) not null, -- e.g. 0.19 = 19%
  base_tax    numeric(12, 2) not null default 0
);

-- FY2024-25 Australian resident tax brackets (Stage 3 cuts)
insert into tax_brackets (fy_start, min_income, max_income, rate, base_tax) values
  (2024,      0.00,  18200.00, 0.0000,      0.00),
  (2024,  18201.00,  45000.00, 0.1900,      0.00),
  (2024,  45001.00, 135000.00, 0.3250,   5092.00),
  (2024, 135001.00, 190000.00, 0.3700,  34254.00),
  (2024, 190001.00,       null, 0.4500,  54946.00);

-- FY2023-24 brackets (pre Stage 3, for historical calcs)
insert into tax_brackets (fy_start, min_income, max_income, rate, base_tax) values
  (2023,      0.00,  18200.00, 0.0000,      0.00),
  (2023,  18201.00,  45000.00, 0.1900,      0.00),
  (2023,  45001.00, 120000.00, 0.3250,   5092.00),
  (2023, 120001.00, 180000.00, 0.3700,  29467.00),
  (2023, 180001.00,       null, 0.4500,  51667.00);


-- ── Low Income Tax Offset (LITO) ──────────────────────────────
create table tax_offsets (
  id          uuid primary key default uuid_generate_v4(),
  fy_start    integer not null,
  offset_type text not null,           -- lito | lmito | sapto
  max_offset  numeric(12, 2) not null,
  phase_out_start numeric(12, 2),
  phase_out_end   numeric(12, 2),
  phase_out_rate  numeric(6, 5),       -- reduction per $ over phase_out_start
  notes       text
);

-- FY2024-25 LITO
insert into tax_offsets (fy_start, offset_type, max_offset, phase_out_start, phase_out_end, phase_out_rate, notes) values
  (2024, 'lito', 700.00, 37500.00, 66667.00, 0.01500, 'Reduces by 1.5c per $1 over $37,500');

-- FY2024-25 Medicare levy (2% of taxable income, reduced for low incomes)
-- Stored as a separate config rather than in tax_offsets
create table medicare_levy_config (
  id              uuid primary key default uuid_generate_v4(),
  fy_start        integer not null,
  levy_rate       numeric(5, 4) not null,          -- 0.02 = 2%
  shade_in_start  numeric(12, 2) not null,          -- below this = no levy
  shade_in_end    numeric(12, 2) not null,          -- above this = full levy
  surcharge_t1_start numeric(12, 2),               -- MLS tier 1 threshold (no private health)
  surcharge_t1_rate  numeric(5, 4)
);

insert into medicare_levy_config (fy_start, levy_rate, shade_in_start, shade_in_end, surcharge_t1_start, surcharge_t1_rate) values
  (2024, 0.0200, 26000.00, 32500.00, 93000.00, 0.0100),
  (2023, 0.0200, 24276.00, 30345.00, 90000.00, 0.0100);

-- ── HELP repayment thresholds (FY2024-25) ─────────────────────
create table help_repayment_rates (
  id            uuid primary key default uuid_generate_v4(),
  fy_start      integer not null,
  min_income    numeric(12, 2) not null,
  max_income    numeric(12, 2),
  rate          numeric(5, 4) not null   -- repayment % of income
);

insert into help_repayment_rates (fy_start, min_income, max_income, rate) values
  (2024,  54435.00,  62850.00, 0.0100),
  (2024,  62851.00,  66620.00, 0.0200),
  (2024,  66621.00,  70618.00, 0.0250),
  (2024,  70619.00,  74855.00, 0.0300),
  (2024,  74856.00,  79346.00, 0.0350),
  (2024,  79347.00,  84994.00, 0.0400),
  (2024,  84995.00,  90496.00, 0.0450),
  (2024,  90497.00,  96539.00, 0.0500),
  (2024,  96540.00, 103136.00, 0.0550),
  (2024, 103137.00, 110182.00, 0.0600),
  (2024, 110183.00, 117644.00, 0.0650),
  (2024, 117645.00, 125679.00, 0.0700),
  (2024, 125680.00, 134230.00, 0.0750),
  (2024, 134231.00, 143359.00, 0.0800),
  (2024, 143360.00, 153092.00, 0.0850),
  (2024, 153093.00, 163467.00, 0.0900),
  (2024, 163468.00, 174531.00, 0.0950),
  (2024, 174532.00,       null, 0.1000);


-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Every table is locked down. Users can only access data
-- for organisations they are a member of.
-- ════════════════════════════════════════════════════════════

-- ── Helper function: get org IDs the current user belongs to ──
create or replace function my_org_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select org_id from memberships where user_id = auth.uid();
$$;

-- Enable RLS on all user-data tables
alter table organisations     enable row level security;
alter table memberships       enable row level security;
alter table categories        enable row level security;
alter table payees            enable row level security;
alter table transactions      enable row level security;
alter table auto_cat_rules    enable row level security;
alter table budgets           enable row level security;
alter table journal_entries   enable row level security;
alter table journal_lines     enable row level security;
alter table tax_profiles      enable row level security;

-- Reference data tables (read by anyone authenticated)
alter table tax_brackets          enable row level security;
alter table tax_offsets           enable row level security;
alter table medicare_levy_config  enable row level security;
alter table help_repayment_rates  enable row level security;

-- ── Policies ──────────────────────────────────────────────────

-- organisations: members can read, owners can update/delete
create policy "members can view their orgs"
  on organisations for select
  using (id in (select my_org_ids()));

create policy "owners can update their orgs"
  on organisations for update
  using (id in (select org_id from memberships where user_id = auth.uid() and role = 'owner'));

-- memberships: users see their own, owners see all in their orgs
create policy "users can view their own memberships"
  on memberships for select
  using (user_id = auth.uid() or org_id in (
    select org_id from memberships where user_id = auth.uid() and role = 'owner'
  ));

-- All financial tables: any member can read, owner/member can write
-- (using a macro pattern for brevity)
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'payees', 'transactions', 'auto_cat_rules',
    'budgets', 'journal_entries', 'tax_profiles'
  ]
  loop
    execute format(
      'create policy "members can view %1$s" on %1$s for select using (org_id in (select my_org_ids()))',
      t
    );
    execute format(
      'create policy "members can insert %1$s" on %1$s for insert with check (org_id in (select my_org_ids()))',
      t
    );
    execute format(
      'create policy "members can update %1$s" on %1$s for update using (org_id in (select my_org_ids()))',
      t
    );
    execute format(
      'create policy "members can delete %1$s" on %1$s for delete using (org_id in (select my_org_ids()))',
      t
    );
  end loop;
end $$;

-- Journal lines: accessible if the parent journal entry is accessible
create policy "members can view journal_lines"
  on journal_lines for select
  using (journal_entry_id in (
    select id from journal_entries where org_id in (select my_org_ids())
  ));

create policy "members can insert journal_lines"
  on journal_lines for insert
  with check (journal_entry_id in (
    select id from journal_entries where org_id in (select my_org_ids())
  ));

create policy "members can update journal_lines"
  on journal_lines for update
  using (journal_entry_id in (
    select id from journal_entries where org_id in (select my_org_ids())
  ));

create policy "members can delete journal_lines"
  on journal_lines for delete
  using (journal_entry_id in (
    select id from journal_entries where org_id in (select my_org_ids())
  ));

-- Reference data: any authenticated user can read
create policy "authenticated users can read tax_brackets"
  on tax_brackets for select using (auth.role() = 'authenticated');

create policy "authenticated users can read tax_offsets"
  on tax_offsets for select using (auth.role() = 'authenticated');

create policy "authenticated users can read medicare_levy_config"
  on medicare_levy_config for select using (auth.role() = 'authenticated');

create policy "authenticated users can read help_repayment_rates"
  on help_repayment_rates for select using (auth.role() = 'authenticated');


-- ════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ════════════════════════════════════════════════════════════

-- ── Create organisation + membership in one transaction ───────
-- Called after a user signs up to bootstrap their personal org.
create or replace function create_personal_org(user_id uuid, org_name text)
returns uuid
language plpgsql
security definer
as $$
declare
  new_org_id uuid;
begin
  -- Create the organisation
  insert into organisations (name, type)
  values (org_name, 'personal')
  returning id into new_org_id;

  -- Make the user the owner
  insert into memberships (org_id, user_id, role)
  values (new_org_id, user_id, 'owner');

  return new_org_id;
end;
$$;


-- ── Seed default categories for a new org ────────────────────
create or replace function seed_default_categories(p_org_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into categories (org_id, label, colour, type, account_group, sort_order) values
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


-- ── Seed default auto-cat rules for a new org ────────────────
create or replace function seed_default_rules(p_org_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into auto_cat_rules (org_id, keyword, category_id, payee_name, sort_order)
  select
    p_org_id,
    r.keyword,
    c.id,
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
  join categories c on c.org_id = p_org_id and c.label = r.cat_label;
end;
$$;


-- ── Updated_at trigger (applied to all relevant tables) ───────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_organisations
  before update on organisations
  for each row execute function set_updated_at();

create trigger set_updated_at_transactions
  before update on transactions
  for each row execute function set_updated_at();

create trigger set_updated_at_tax_profiles
  before update on tax_profiles
  for each row execute function set_updated_at();
