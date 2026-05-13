/**
 * supabase/functions/basiq-sync/index.ts
 *
 * Syncs transactions from Basiq into transactions table.
 * Transactions land with pending_import = true (hidden until user approves in Import review).
 * If the pending_import column doesn't exist yet, falls back to inserting normally.
 *
 * ⚠️  Run migration 016_pending_import.sql before deploying this function.
 *
 * Request body: { orgId: string, fromDate?: string }
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Inlined Basiq helpers (no _shared import — required for dashboard deploy) ──

const BASIQ_BASE = 'https://au-api.basiq.io';

async function getBasiqToken(apiKey: string): Promise<string> {
  const key = apiKey.trim();
  const res = await fetch(`${BASIQ_BASE}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${key}`,  // Basiq v3: raw API key, not base64-encoded
      'Content-Type':  'application/x-www-form-urlencoded',
      'basiq-version': '3.0',
    },
    body: 'scope=SERVER_ACCESS',
  });
  if (!res.ok) throw new Error(`Basiq token error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function getBasiqAccounts(token: string, basiqUserId: string): Promise<any[]> {
  const res = await fetch(`${BASIQ_BASE}/users/${basiqUserId}/accounts`, {
    headers: { 'Authorization': `Bearer ${token}`, 'basiq-version': '3.0' },
  });
  if (!res.ok) throw new Error(`Basiq accounts ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data ?? [];
}

async function getBasiqTransactions(
  token: string,
  basiqUserId: string,
  fromDate: string,
): Promise<any[]> {
  // Basiq v3 uses filter syntax for date ranges, not a 'from' param
  const filter = `transaction.postDate.gteq('${fromDate}')`;
  const params = new URLSearchParams({ limit: '500', filter });
  let url = `${BASIQ_BASE}/users/${basiqUserId}/transactions?${params}`;
  const all: any[] = [];
  while (url) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'basiq-version': '3.0' },
    });
    if (!res.ok) throw new Error(`Basiq txns ${res.status}: ${await res.text()}`);
    const data = await res.json();
    all.push(...(data.data ?? []));
    url = data.links?.next ?? null;
  }
  return all;
}

function mapAccountType(basiqClass: string): string {
  const m: Record<string, string> = {
    'transaction': 'checking',
    'savings':     'savings',
    'credit-card': 'credit_card',
    'mortgage':    'loan',
    'loan':        'loan',
    'investment':  'investment',
  };
  return m[basiqClass?.toLowerCase()] ?? 'checking';
}

function normaliseBasiqTxn(bt: any, bankAccountId: string, orgId: string): object {
  // bt.account is a string ID (not an object), bt.amount is a string e.g. "-139.98"
  // bt.postDate / bt.transactionDate are ISO datetimes e.g. "2017-11-10T21:46:44Z"
  const dateStr = (bt.postDate ?? bt.transactionDate ?? '').slice(0, 10);
  return {
    org_id:       orgId,
    account_id:   bankAccountId,
    date:         dateStr || new Date().toISOString().slice(0, 10),
    description:  bt.description ?? '',
    amount:       parseFloat(bt.amount ?? '0'),
    import_hash:  `basiq:${bt.id}`,
    basiq_txn_id:   bt.id,
    post_datetime:  bt.postDate ?? bt.transactionDate ?? null,  // full ISO datetime for intraday ordering
    imported:       true,   // marks as bank-feed (not manually entered)
  };
}

// ── CORS ────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Handler ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { orgId, fromDate } = await req.json();
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'orgId required' }), { status: 400, headers: corsHeaders });
    }

    const { data: org } = await supabase.from('organisations').select('*').eq('id', orgId).single();
    if (!org?.basiq_user_id) {
      return new Response(
        JSON.stringify({ error: 'No Basiq connection. Connect a bank first.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = (Deno.env.get('BASIQ_API_KEY') ?? '').trim();
    if (!apiKey) throw new Error('BASIQ_API_KEY environment variable is not set');
    const token  = await getBasiqToken(apiKey);
    const from   = fromDate ?? new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10); // 2 years default

    // ── 1. Sync accounts ─────────────────────────────────────────────────────
    const basiqAccounts = await getBasiqAccounts(token, org.basiq_user_id);
    const accountMap: Record<string, string> = {};

    for (const ba of basiqAccounts) {
      const { data: existing } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('org_id', orgId)
        .eq('basiq_account_id', ba.id)
        .maybeSingle();

      if (existing) {
        accountMap[ba.id] = existing.id;
      } else {
        const isCC        = ba.class?.type === 'credit-card';
        const creditLimit = isCC ? (parseFloat(ba.creditLimit ?? ba.availableFunds ?? '0') || null) : null;
        const openingBal  = parseFloat(ba.balance ?? ba.availableBalance ?? '0') || 0;

        const { data: created } = await supabase
          .from('bank_accounts')
          .insert({
            org_id:            orgId,
            name:              (ba.name ?? ba.accountHolder ?? `${ba.institution?.shortName ?? ''} ${ba.class?.title ?? ''}`).trim() || 'Bank account',
            type:              mapAccountType(ba.class?.type),
            currency:          ba.currency ?? 'AUD',
            opening_balance:   openingBal,
            credit_limit:      creditLimit,
            basiq_account_id:  ba.id,
            basiq_institution: ba.institution?.shortName ?? ba.institution?.name ?? '',
            colour:            '#185FA5',
            sort_order:        0,
          })
          .select()
          .single();
        if (created) accountMap[ba.id] = created.id;
      }
    }

    // ── 2. Fetch & insert transactions ──────────────────────────────────────
    // Transactions land with pending_import = true so they don't appear in the
    // Transactions view until the user approves them in the Import review screen.
    // If migration 016 hasn't been run yet, we omit pending_import (graceful fallback).
    const basiqTxns = await getBasiqTransactions(token, org.basiq_user_id, from);

    let inserted = 0, skipped = 0, hasPendingColumn = true;

    // Probe whether the pending_import column exists
    const { error: probeErr } = await supabase
      .from('transactions')
      .select('pending_import')
      .limit(1);
    if (probeErr?.message?.includes('pending_import') || probeErr?.code === '42703') {
      hasPendingColumn = false;
      console.warn('pending_import column not found — run migration 016_pending_import.sql');
    }

    const rows = basiqTxns
      .filter(bt => accountMap[bt.account])
      .map(bt => ({
        ...normaliseBasiqTxn(bt, accountMap[bt.account], orgId),
        ...(hasPendingColumn ? { pending_import: true } : {}),
      }));

    if (rows.length > 0) {
      // Dedup manually: check which import_hashes already exist, then insert only new ones.
      // This avoids relying on a specific unique constraint configuration.
      const hashes = rows.map((r: any) => r.import_hash).filter(Boolean);
      const { data: existing } = await supabase
        .from('transactions')
        .select('import_hash')
        .eq('org_id', orgId)
        .in('import_hash', hashes);

      const existingSet = new Set((existing ?? []).map((e: any) => e.import_hash));
      const newRows = rows.filter((r: any) => !existingSet.has(r.import_hash));
      skipped = rows.length - newRows.length;

      if (newRows.length > 0) {
        const { data: insertedRows, error: insertErr } = await supabase
          .from('transactions')
          .insert(newRows)
          .select('id');

        if (insertErr) throw insertErr;
        inserted = insertedRows?.length ?? 0;
      }
    }

    await supabase
      .from('organisations')
      .update({ basiq_last_synced: new Date().toISOString() })
      .eq('id', orgId);

    // Log summary to edge function logs for debugging
    console.log(`basiq-sync: fetched=${basiqTxns.length} rows=${rows.length} inserted=${inserted} skipped=${skipped} pending=${hasPendingColumn}`);

    return new Response(
      JSON.stringify({
        ok: true,
        accounts: basiqAccounts.length,
        hasPendingColumn,
        transactions: {
          fetched:  basiqTxns.length,   // raw from Basiq
          matched:  rows.length,         // matched to known accountMap
          inserted,                      // truly new rows inserted
          skipped,                       // already existed (deduped)
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error('basiq-sync error:', e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
