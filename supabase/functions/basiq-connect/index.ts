/**
 * _shared/basiq.ts
 * Basiq API v3 helpers shared across Edge Functions.
 * Docs: https://api.basiq.io/docs
 */

const BASIQ_BASE = 'https://au-api.basiq.io';

/** Exchange your API key for a server access token (valid 60 mins) */
export async function getBasiqToken(apiKey: string): Promise<string> {
  const res = await fetch(`${BASIQ_BASE}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${apiKey.trim()}`,  // Basiq v3: raw API key, not base64-encoded
      'Content-Type':  'application/x-www-form-urlencoded',
      'basiq-version': '3.0',
    },
    body: 'scope=SERVER_ACCESS',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Basiq token error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

/** Create a Basiq user and return their ID */
export async function createBasiqUser(token: string, email: string): Promise<string> {
  const res = await fetch(`${BASIQ_BASE}/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'basiq-version': '3.0',
    },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Basiq create user ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

/** Get or create a Basiq consent / auth link for the user */
export async function getAuthLink(token: string, basiqUserId: string, redirectUrl: string): Promise<string> {
  const res = await fetch(`${BASIQ_BASE}/users/${basiqUserId}/auth_link`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'basiq-version': '3.0',
    },
    body: JSON.stringify({
      mobile:      '',
      redirectUrl,
    }),
  });
  if (!res.ok) throw new Error(`Basiq auth link ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.links?.public ?? data.url ?? data.link;
}

/** Fetch all accounts for a Basiq user */
export async function getBasiqAccounts(token: string, basiqUserId: string): Promise<any[]> {
  const res = await fetch(`${BASIQ_BASE}/users/${basiqUserId}/accounts`, {
    headers: { 'Authorization': `Bearer ${token}`, 'basiq-version': '3.0' },
  });
  if (!res.ok) throw new Error(`Basiq accounts ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data ?? [];
}

/** Fetch transactions for a Basiq account, from a given date */
export async function getBasiqTransactions(
  token: string,
  basiqUserId: string,
  fromDate: string,        // YYYY-MM-DD
  toDate?: string,
): Promise<any[]> {
  const params = new URLSearchParams({
    'filter[account.id]': '', // fetch all accounts
    limit: '500',
    from: fromDate,
  });
  if (toDate) params.set('to', toDate);

  let url = `${BASIQ_BASE}/users/${basiqUserId}/transactions?${params}`;
  const all: any[] = [];

  // Paginate through Basiq's cursor-based pages
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

/** Map a Basiq account type string to your app's type enum */
export function mapAccountType(basiqClass: string): string {
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

/**
 * Normalise a Basiq transaction to match your transactions table schema.
 * Basiq amounts: negative = money out, positive = money in (same as your schema).
 */
export function normaliseBasiqTxn(bt: any, bankAccountId: string, orgId: string): object {
  // bt.account is a plain string ID. bt.amount is a string e.g. "-139.98".
  // bt.postDate / bt.transactionDate are ISO datetime strings.
  const dateStr = (bt.postDate ?? bt.transactionDate ?? '').slice(0, 10);
  return {
    org_id:       orgId,
    account_id:   bankAccountId,
    date:         dateStr || new Date().toISOString().slice(0, 10),
    description:  bt.description ?? '',
    amount:       parseFloat(bt.amount ?? '0'),
    currency:     bt.currency ?? 'AUD',
    import_hash:  `basiq:${bt.id}`,
    basiq_txn_id: bt.id,
  };
}
