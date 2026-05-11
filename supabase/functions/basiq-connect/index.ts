/**
 * supabase/functions/basiq-connect/index.ts
 *
 * Called by the frontend when the user clicks "Connect bank via Basiq".
 * Steps:
 *   1. Verifies the user is authenticated (reads JWT)
 *   2. Looks up (or creates) the Basiq user ID for this org
 *   3. Returns a Basiq consent URL — the browser opens this so the user
 *      can grant access to their bank inside Basiq's hosted UI
 *
 * Environment variables required (set in Supabase dashboard → Edge Functions → Secrets):
 *   BASIQ_API_KEY     — your Basiq API key (from basiq.io dashboard)
 *   SUPABASE_URL      — auto-set by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase runtime
 */

import { serve }                from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient }         from 'https://esm.sh/@supabase/supabase-js@2';
import { getBasiqToken, createBasiqUser, getAuthLink } from '../_shared/basiq.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth: verify caller is a logged-in user ────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    // ── Read body ─────────────────────────────────────────────────────────
    const { orgId, redirectUrl } = await req.json();
    if (!orgId) return new Response(JSON.stringify({ error: 'orgId required' }), { status: 400, headers: corsHeaders });

    // ── Get Basiq token ───────────────────────────────────────────────────
    const apiKey = Deno.env.get('BASIQ_API_KEY');
    if (!apiKey) return new Response(JSON.stringify({ error: 'BASIQ_API_KEY not set' }), { status: 500, headers: corsHeaders });
    const token = await getBasiqToken(apiKey);

    // ── Look up or create Basiq user for this org ─────────────────────────
    const { data: org } = await supabase
      .from('organisations')
      .select('id, name, basiq_user_id')
      .eq('id', orgId)
      .single();

    let basiqUserId = org?.basiq_user_id;

    if (!basiqUserId) {
      // Create a Basiq user (use org name + id as a stable email-like identifier)
      const fakeEmail = `org-${orgId}@ledger.app`;
      basiqUserId = await createBasiqUser(token, fakeEmail);
      // Save it back to the org
      await supabase.from('organisations').update({ basiq_user_id: basiqUserId }).eq('id', orgId);
    }

    // ── Generate the consent link ─────────────────────────────────────────
    const fallbackRedirect = redirectUrl ?? `${req.headers.get('origin') ?? 'https://yourapp.com'}/basiq-callback`;
    const consentUrl = await getAuthLink(token, basiqUserId, fallbackRedirect);

    return new Response(
      JSON.stringify({ url: consentUrl, basiqUserId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error('basiq-connect error:', e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
