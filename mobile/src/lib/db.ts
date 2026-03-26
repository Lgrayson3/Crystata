import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('ledger.db');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS work_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date      TEXT NOT NULL,
      tips          REAL DEFAULT 0,
      hourly_rate   REAL DEFAULT 0,
      hours_worked  REAL DEFAULT 0,
      source        TEXT DEFAULT 'csv',
      imported_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(log_date, source)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      plaid_txn_id  TEXT UNIQUE,
      txn_date      TEXT NOT NULL,
      amount        REAL NOT NULL,
      direction     TEXT NOT NULL CHECK(direction IN ('debit','credit')),
      merchant_hash TEXT,
      category      TEXT,
      account_id    TEXT,
      imported_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      plaid_id  TEXT UNIQUE,
      name_hash TEXT,
      type      TEXT,
      subtype   TEXT,
      balance   REAL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS liabilities (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name_hash    TEXT,
      amount       REAL NOT NULL,
      due_date     TEXT,
      category     TEXT,
      is_recurring INTEGER DEFAULT 1,
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date    TEXT NOT NULL,
      gross_earned     REAL DEFAULT 0,
      bank_deposits    REAL DEFAULT 0,
      cash_on_hand     REAL DEFAULT 0,
      current_balance  REAL DEFAULT 0,
      upcoming_bills   REAL DEFAULT 0,
      savings_goal     REAL DEFAULT 0,
      essential_budget REAL DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Work Logs ─────────────────────────────────────────────────────────────────

export interface WorkLogRow {
  log_date: string;
  tips: number;
  hourly_rate: number;
  hours_worked: number;
  source?: string;
}

export async function insertWorkLogs(rows: WorkLogRow[]): Promise<number> {
  const db = await getDb();
  let inserted = 0;
  for (const row of rows) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO work_logs (log_date, tips, hourly_rate, hours_worked, source)
       VALUES (?, ?, ?, ?, ?)`,
      row.log_date, row.tips, row.hourly_rate, row.hours_worked, row.source ?? 'csv'
    );
    if (result.changes > 0) inserted++;
  }
  return inserted;
}

export async function getGrossEarned(startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(hourly_rate * hours_worked + tips), 0) AS total
     FROM work_logs WHERE log_date BETWEEN ? AND ?`,
    startDate, endDate
  );
  return result?.total ?? 0;
}

// ── Transactions ──────────────────────────────────────────────────────────────

export interface TxnRow {
  plaid_txn_id: string;
  txn_date: string;
  amount: number;
  direction: 'debit' | 'credit';
  merchant_hash: string;
  category: string;
  account_id: string;
}

export async function insertTransactions(rows: TxnRow[]): Promise<number> {
  const db = await getDb();
  let inserted = 0;
  for (const row of rows) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO transactions
         (plaid_txn_id, txn_date, amount, direction, merchant_hash, category, account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      row.plaid_txn_id, row.txn_date, row.amount, row.direction,
      row.merchant_hash, row.category, row.account_id
    );
    if (result.changes > 0) inserted++;
  }
  return inserted;
}

export async function getBankDeposits(startDate: string, endDate: string): Promise<number> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'credit' AND txn_date BETWEEN ? AND ?`,
    startDate, endDate
  );
  return result?.total ?? 0;
}

export async function getRecentTransactions(days = 30): Promise<TxnRow[]> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return db.getAllAsync<TxnRow>(
    `SELECT * FROM transactions WHERE txn_date >= ? ORDER BY txn_date DESC LIMIT 200`,
    cutoff
  );
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function upsertAccounts(accounts: { plaid_id: string; name_hash: string; type: string; subtype: string; balance: number }[]) {
  const db = await getDb();
  for (const a of accounts) {
    await db.runAsync(
      `INSERT INTO accounts (plaid_id, name_hash, type, subtype, balance, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(plaid_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`,
      a.plaid_id, a.name_hash, a.type, a.subtype, a.balance
    );
  }
}

export async function getCurrentBalance(): Promise<number> {
  const db = await getDb();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(balance), 0) AS total FROM accounts WHERE type = 'depository'`
  );
  return result?.total ?? 0;
}

// ── Liabilities ───────────────────────────────────────────────────────────────

export interface LiabilityRow {
  name_hash: string;
  amount: number;
  due_date: string;
  category: string;
}

export async function replaceLiabilities(rows: LiabilityRow[]) {
  const db = await getDb();
  await db.runAsync('DELETE FROM liabilities');
  for (const row of rows) {
    await db.runAsync(
      `INSERT INTO liabilities (name_hash, amount, due_date, category, is_recurring)
       VALUES (?, ?, ?, ?, 1)`,
      row.name_hash, row.amount, row.due_date, row.category
    );
  }
}

export async function getUpcomingBills(withinDays = 30): Promise<LiabilityRow[]> {
  const db = await getDb();
  return db.getAllAsync<LiabilityRow>(
    `SELECT name_hash, amount, due_date, category FROM liabilities
     WHERE is_recurring = 1
     ORDER BY due_date ASC`
  );
}

export async function getUpcomingBillsTotal(withinDays = 30): Promise<number> {
  const bills = await getUpcomingBills(withinDays);
  return bills.reduce((sum, b) => sum + b.amount, 0);
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export interface Snapshot {
  snapshot_date: string;
  gross_earned: number;
  bank_deposits: number;
  cash_on_hand: number;
  current_balance: number;
  upcoming_bills: number;
  savings_goal: number;
  essential_budget: number;
  bleed: number;
  safe_to_spend: number;
}

export async function saveSnapshot(s: Snapshot) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO snapshots
       (snapshot_date, gross_earned, bank_deposits, cash_on_hand,
        current_balance, upcoming_bills, savings_goal, essential_budget)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    s.snapshot_date, s.gross_earned, s.bank_deposits, s.cash_on_hand,
    s.current_balance, s.upcoming_bills, s.savings_goal, s.essential_budget
  );
}

export async function getSnapshotHistory(limit = 30): Promise<Snapshot[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT *,
       gross_earned - bank_deposits - cash_on_hand AS bleed,
       current_balance - upcoming_bills - savings_goal - essential_budget AS safe_to_spend
     FROM snapshots ORDER BY snapshot_date DESC LIMIT ?`,
    limit
  );
  return rows;
}
