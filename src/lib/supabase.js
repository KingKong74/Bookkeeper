/**
 * lib/supabase.js
 * ---------------
 * Supabase client singleton. Import this wherever you need DB access.
 *
 * Setup:
 *   1. Copy .env.example to .env.local
 *   2. Fill in your Supabase project URL and anon key
 *      (Dashboard → Settings → API)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in your project URL and anon key.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    // Persist session in localStorage so users stay logged in on refresh
    persistSession: true,
    autoRefreshToken: true,
  },
});


// ════════════════════════════════════════════════════════════
// AUTH HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Sign up with email + password.
 * Org creation, default categories and rules are handled automatically
 * by the on_auth_user_created database trigger — no manual RPC needed.
 */
export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Pass the display name as metadata so the trigger can use it
      data: { display_name: displayName || '' },
    },
  });
  if (error) throw error;
  return { user: data.user };
}

/** Sign in with email + password */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Sign out */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Get the current session (null if not logged in) */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}


// ════════════════════════════════════════════════════════════
// ORGANISATION HELPERS
// ════════════════════════════════════════════════════════════

/** Fetch all organisations the current user belongs to */
export async function getMyOrgs() {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organisations(*)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(m => ({ ...m.organisations, role: m.role }));
}

/** Invite another user to an org by email (creates a pending membership) */
export async function inviteToOrg(orgId, email, role = 'member') {
  // Look up user by email via a secure RPC (avoids exposing auth.users)
  const { data, error } = await supabase.rpc('invite_user_to_org', {
    p_org_id: orgId,
    p_email:  email,
    p_role:   role,
  });
  if (error) throw error;
  return data;
}


// ════════════════════════════════════════════════════════════
// TRANSACTIONS
// ════════════════════════════════════════════════════════════

/** Fetch transactions for an org within a date range */
export async function getTransactions(orgId, from, to) {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      categories ( id, label, colour, type, account_group ),
      payees      ( id, name, colour )
    `)
    .eq('org_id', orgId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

/** Insert a single transaction */
export async function createTransaction(orgId, txn) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ org_id: orgId, ...txn })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Update a transaction */
export async function updateTransaction(id, updates) {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a transaction */
export async function deleteTransaction(id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * Bulk insert imported transactions.
 * Uses import_hash to skip exact duplicates.
 * Returns { inserted, skipped } counts.
 */
export async function bulkImportTransactions(orgId, transactions) {
  const withHash = transactions.map(t => ({
    org_id:      orgId,
    date:        t.date,
    description: t.desc || t.description,
    amount:      t.amt  ?? t.amount,
    note:        t.note || null,
    imported:    true,
    account_id:  t.account_id || null,
    import_hash: `${t.date}|${(t.desc||t.description||'')}|${(t.amt??t.amount)}`,
  }));

  // Fetch existing transactions with hashes so we can:
  // a) skip true duplicates (same hash AND same account)
  // b) update account_id on existing transactions that are missing it
  const { data: existing } = await supabase
    .from('transactions')
    .select('id, import_hash, account_id')
    .eq('org_id', orgId)
    .not('import_hash', 'is', null);

  const existingByHash = {};
  for (const e of (existing || [])) {
    existingByHash[e.import_hash] = e;
  }

  const toInsert  = [];
  const toUpdate  = []; // existing rows that need account_id set
  let skipped = 0;

  for (const t of withHash) {
    const ex = existingByHash[t.import_hash];
    if (!ex) {
      // New transaction — insert
      toInsert.push(t);
    } else if (t.account_id && !ex.account_id) {
      // Exists but has no account linked — update it
      toUpdate.push({ id: ex.id, account_id: t.account_id });
    } else {
      // True duplicate — skip
      skipped++;
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('transactions').insert(toInsert);
    if (error) throw error;
  }

  // Batch update account_id for existing unlinked transactions
  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map(u =>
        supabase.from('transactions').update({ account_id: u.account_id }).eq('id', u.id)
      )
    );
  }

  return { inserted: toInsert.length, linked: toUpdate.length, skipped };
}


// ════════════════════════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════════════════════════

export async function getCategories(orgId) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createCategory(orgId, cat) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ org_id: orgId, ...cat })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, updates) {
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}


// ════════════════════════════════════════════════════════════
// PAYEES
// ════════════════════════════════════════════════════════════

export async function getPayees(orgId) {
  const { data, error } = await supabase
    .from('payees')
    .select('*')
    .eq('org_id', orgId)
    .order('name');
  if (error) throw error;
  return data;
}

/** Upsert a payee by name (create if not exists, return existing if it does) */
export async function upsertPayee(orgId, name, colour) {
  const { data, error } = await supabase
    .from('payees')
    .upsert({ org_id: orgId, name, colour }, { onConflict: 'org_id,name' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayee(id) {
  const { error } = await supabase.from('payees').delete().eq('id', id);
  if (error) throw error;
}


// ════════════════════════════════════════════════════════════
// AUTO-CAT RULES
// ════════════════════════════════════════════════════════════

export async function getRules(orgId) {
  const { data, error } = await supabase
    .from('auto_cat_rules')
    .select('*, categories(id, label, colour)')
    .eq('org_id', orgId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createRule(orgId, rule) {
  const { data, error } = await supabase
    .from('auto_cat_rules')
    .insert({ org_id: orgId, ...rule })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRule(id, updates) {
  const { data, error } = await supabase
    .from('auto_cat_rules')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRule(id) {
  const { error } = await supabase.from('auto_cat_rules').delete().eq('id', id);
  if (error) throw error;
}


// ════════════════════════════════════════════════════════════
// BUDGETS
// ════════════════════════════════════════════════════════════

export async function getBudgets(orgId, fyStart) {
  const { data, error } = await supabase
    .from('budgets')
    .select('*, categories(id, label, colour, type)')
    .eq('org_id', orgId)
    .eq('fy_start', fyStart);
  if (error) throw error;
  return data;
}

/** Upsert a budget row (insert or update) */
export async function upsertBudget(orgId, categoryId, fyStart, monthlyAmount) {
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { org_id: orgId, category_id: categoryId, fy_start: fyStart, monthly_amount: monthlyAmount },
      { onConflict: 'org_id,category_id,fy_start' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}


// ════════════════════════════════════════════════════════════
// JOURNALS
// ════════════════════════════════════════════════════════════

export async function getJournals(orgId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*)')
    .eq('org_id', orgId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

/** Create a journal entry with all its lines in one transaction */
export async function createJournalEntry(orgId, { date, description, ref, account_id, lines }) {
  // Insert the header
  const header = { org_id: orgId, date, description };
  if (ref)        header.ref        = ref;
  if (account_id) header.account_id = account_id;

  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert(header)
    .select()
    .single();
  if (entryError) throw entryError;

  // Insert the lines — accepts both {ac,dr,cr} and {account_name,debit,credit}
  const linesWithId = (lines||[]).map((l, i) => ({
    journal_entry_id: entry.id,
    account_name:     l.ac ?? l.account_name ?? '',
    debit:            parseFloat(l.dr ?? l.debit)  || 0,
    credit:           parseFloat(l.cr ?? l.credit) || 0,
    sort_order:       l.sort_order ?? i,
  }));

  if (linesWithId.length > 0) {
    const { error: linesError } = await supabase
      .from('journal_lines')
      .insert(linesWithId);
    if (linesError) throw linesError;
  }

  return entry;
}


// ════════════════════════════════════════════════════════════
// TAX PROFILE
// ════════════════════════════════════════════════════════════


export async function updateJournalEntry(id, updates, lines = null) {
  const { data: entry, error } = await supabase
    .from('journal_entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  if (lines !== null) {
    // Replace all lines
    await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
    if (lines.length > 0) {
      const { error: lErr } = await supabase.from('journal_lines').insert(
        lines.map((l, i) => ({ journal_entry_id: id, ...l, sort_order: i }))
      );
      if (lErr) throw lErr;
    }
  }
  return entry;
}

export async function getTaxProfile(orgId, fyStart) {
  const { data, error } = await supabase
    .from('tax_profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('fy_start', fyStart)
    .maybeSingle();   // returns null if not found (no error)
  if (error) throw error;
  return data;
}

export async function upsertTaxProfile(orgId, fyStart, profile) {
  const { data, error } = await supabase
    .from('tax_profiles')
    .upsert(
      { org_id: orgId, fy_start: fyStart, ...profile },
      { onConflict: 'org_id,fy_start' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Fetch Australian tax reference data for a given FY */
export async function getTaxReferenceData(fyStart) {
  const [brackets, offsets, medicare, help] = await Promise.all([
    supabase.from('tax_brackets').select('*').eq('fy_start', fyStart).order('min_income'),
    supabase.from('tax_offsets').select('*').eq('fy_start', fyStart),
    supabase.from('medicare_levy_config').select('*').eq('fy_start', fyStart).maybeSingle(),
    supabase.from('help_repayment_rates').select('*').eq('fy_start', fyStart).order('min_income'),
  ]);

  // Tax reference data is optional — fall back to FY2024 if current FY not in DB yet
  if (!brackets.data?.length) {
    return getTaxReferenceData(2024);
  }

  return {
    brackets:  brackets.data  || [],
    offsets:   offsets.data   || [],
    medicare:  medicare.data  || null,
    helpRates: help.data      || [],
  };
}


// ════════════════════════════════════════════════════════════
// BANK ACCOUNTS
// ════════════════════════════════════════════════════════════

export async function getBankAccounts(orgId) {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createBankAccount(orgId, account) {
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({ org_id: orgId, ...account })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBankAccount(id, updates) {
  const { data, error } = await supabase
    .from('bank_accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBankAccount(id) {
  // First unlink all transactions from this account
  await supabase
    .from('transactions')
    .update({ account_id: null })
    .eq('account_id', id);
  // Then hard delete the account
  const { error } = await supabase
    .from('bank_accounts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Transaction file attachments ──────────────────────────────────────────────
export async function getTransactionFiles(txnId) {
  const { data, error } = await supabase
    .from('transaction_files')
    .select('*')
    .eq('transaction_id', txnId)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function uploadTransactionFile(orgId, txnId, file, userId) {
  const ext  = file.name.split('.').pop();
  const path = `${orgId}/${txnId}/${Date.now()}-${file.name}`;

  const { error: upErr } = await supabase.storage
    .from('transaction-files')
    .upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from('transaction_files')
    .insert({
      org_id: orgId, transaction_id: txnId,
      filename: file.name, storage_path: path,
      mime_type: file.type, size_bytes: file.size,
      uploaded_by: userId,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteTransactionFile(fileId, storagePath) {
  await supabase.storage.from('transaction-files').remove([storagePath]);
  const { error } = await supabase.from('transaction_files').delete().eq('id', fileId);
  if (error) throw error;
}

export async function getFileUrl(storagePath) {
  const { data } = await supabase.storage
    .from('transaction-files')
    .createSignedUrl(storagePath, 3600); // 1hr expiry
  return data?.signedUrl;
}
