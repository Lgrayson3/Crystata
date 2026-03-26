import * as Crypto from 'expo-crypto';
import { insertTransactions, upsertAccounts, replaceLiabilities, TxnRow, LiabilityRow } from './db';

export interface PlaidConfig {
  clientId: string;
  secret: string;
  accessToken: string;
  env: 'sandbox' | 'development' | 'production';
}

function baseUrl(env: string) {
  if (env === 'production') return 'https://production.plaid.com';
  if (env === 'development') return 'https://development.plaid.com';
  return 'https://sandbox.plaid.com';
}

async function plaidPost(cfg: PlaidConfig, path: string, body: object) {
  const res = await fetch(`${baseUrl(cfg.env)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.clientId,
      secret: cfg.secret,
      access_token: cfg.accessToken,
      ...body,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Plaid ${path} failed: ${err}`);
  }
  return res.json();
}

async function hashStr(s: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    s.trim().toLowerCase()
  );
  return digest.slice(0, 16);
}

export async function syncTransactions(cfg: PlaidConfig, daysBack = 90): Promise<number> {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);

  const data = await plaidPost(cfg, '/transactions/get', {
    start_date: start,
    end_date: end,
    options: { count: 500, offset: 0 },
  });

  const rows: TxnRow[] = await Promise.all(
    (data.transactions as any[]).map(async (t) => ({
      plaid_txn_id: t.transaction_id,
      txn_date: t.date,
      amount: Math.abs(t.amount),
      direction: t.amount > 0 ? 'debit' : 'credit',
      merchant_hash: await hashStr(t.merchant_name || t.name || ''),
      category: (t.category?.[0]) ?? 'Uncategorized',
      account_id: t.account_id,
    }))
  );

  return insertTransactions(rows);
}

export async function syncAccounts(cfg: PlaidConfig): Promise<number> {
  const data = await plaidPost(cfg, '/accounts/get', {});
  const accounts = await Promise.all(
    (data.accounts as any[]).map(async (a) => ({
      plaid_id: a.account_id,
      name_hash: await hashStr(a.name || ''),
      type: String(a.type),
      subtype: String(a.subtype || ''),
      balance: a.balances?.current ?? 0,
    }))
  );
  await upsertAccounts(accounts);
  return accounts.length;
}

export async function syncLiabilities(cfg: PlaidConfig): Promise<number> {
  const data = await plaidPost(cfg, '/liabilities/get', {});
  const liabilities: LiabilityRow[] = [];

  for (const cc of data.liabilities?.credit ?? []) {
    liabilities.push({
      name_hash: await hashStr(cc.name || ''),
      amount: cc.last_statement_balance ?? 0,
      due_date: cc.next_payment_due_date ?? '',
      category: 'credit_card',
    });
  }
  for (const sl of data.liabilities?.student ?? []) {
    liabilities.push({
      name_hash: await hashStr(sl.loan_name || ''),
      amount: sl.last_payment_amount ?? 0,
      due_date: sl.next_payment_due_date ?? '',
      category: 'student_loan',
    });
  }

  await replaceLiabilities(liabilities);
  return liabilities.length;
}
