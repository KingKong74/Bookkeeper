/**
 * supabase/functions/basiq-sync/index.ts
 *
 * Syncs transactions from Basiq into your transactions table.
 * Call this:
 *   - After user completes the Basiq consent flow (redirect callback)
 *   - Manually via "Sync now" button in the UI
 *   - On a schedule (add a cron via pg_cron or Supabase scheduled functions)
 *
 * Request body:
 *   { orgId: string, fromDate?: string }  // fromDate defaults to 90 days ago
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getBasiqToken,
  getBasiqAccounts,
  getBasiqTransactions,
  normaliseBasiqTxn,
  mapAccountType,
} from '../_shared/basiq.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { orgId, fromDate } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ error: 'orgId required' }), { status: 400, headers: corsHeaders });

    // Get org + basiq user ID
    const { data: org } = await supabase.from('organisations').select('*').eq('id', orgId).single();
    if (!org?.basiq_user_id) {
      return new Response(JSON.stringify({ error: 'No Basiq connection. Connect a bank first.' }), { status: 400, headers: corsHeaders });
    }

    const apiKey  = Deno.env.get('BASIQ_API_KEY')!;
    const token   = await getBasiqToken(apiKey);
    const from    = fromDate ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    // ── 1. Sync accounts ──────────────────────────────────────────────────
    const basiqAccounts = await getBasiqAccounts(token, org.basiq_user_id);
    const accountMap: Record<string, string> = {}; // basiqAccountId → your bank_account.id

    for (const ba of basiqAccounts) {
      // Check if we already have this account linked
      const { data: existing } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('org_id', orgId)
        .eq('basiq_account_id', ba.id)
        .maybeSingle();

      if (existing) {
        accountMap[ba.id] = existing.id;
      } else {
        // Create a new bank account record
        const { data: created } = await supabase
          .from('bank_accounts')
          .insert({
            org_id:            orgId,
            name:              ba.name ?? ba.accountHolder ?? `${ba.institution?.shortName} ${ba.class?.title ?? ''}`.trim(),
            type:              mapAccountType(ba.class?.type),
            currency:          ba.currency ?? 'AUD',
            opening_balance:   0, // Basiq doesn't provide this; user can set manually
            basiq_account_id:  ba.id,
            basiq_institution: ba.institution?.shortName ?? ba.institution?.name,
            colour:            '#185FA5',
            sort_order:        0,
          })
          .select()
          .single();
        if (created) accountMap[ba.id] = created.id;
      }
    }

    // ── 2. Fetch & import transactions ────────────────────────────────────
    const basiqTxns = await getBasiqTransactions(token, org.basiq_user_id, from);

    let inserted = 0, skipped = 0;
    const rows = basiqTxns
      .filter(bt => accountMap[bt.account?.id])
      .map(bt => normaliseBasiqTxn(bt, accountMap[bt.account.id], orgId));

    if (rows.length > 0) {
      // Upsert with conflict on import_hash (dedup by Basiq txn ID)
      const { data: upserted, error: upsertErr } = await supabase
        .from('transactions')
        .upsert(rows, { onConflict: 'import_hash', ignoreDuplicates: true })
        .select('id');

      if (upsertErr) throw upsertErr;
      inserted = upserted?.length ?? 0;
      skipped  = rows.length - inserted;
    }

    // ── 3. Update last_synced_at on org ───────────────────────────────────
    await supabase.from('organisations').update({ basiq_last_synced: new Date().toISOString() }).eq('id', orgId);

    return new Response(
      JSON.stringify({
        ok: true,
        accounts: basiqAccounts.length,
        transactions: { fetched: basiqTxns.length, inserted, skipped },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error('basiq-sync error:', e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
