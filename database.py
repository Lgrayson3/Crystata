"""
Local SQLite database layer.
Uses sqlcipher3 for encryption at rest when the key is provided,
falls back to plain sqlite3 for development environments where
sqlcipher3-binary is not installed.
"""

import os
import sqlite3
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("database")

DB_PATH = os.getenv("DB_PATH", "./data/ledger.db")
DB_KEY = os.getenv("DB_ENCRYPTION_KEY", "")


def _get_connection() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    if DB_KEY:
        try:
            from sqlcipher3 import dbapi2 as sqlcipher
            conn = sqlcipher.connect(DB_PATH)
            conn.execute(f"PRAGMA key='{DB_KEY}'")
            return conn
        except ImportError:
            log.warning("sqlcipher3 not available; falling back to plain SQLite.")
    return sqlite3.connect(DB_PATH)


def init_db():
    """Create all tables if they don't exist."""
    conn = _get_connection()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS work_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date    TEXT NOT NULL,
            tips        REAL DEFAULT 0,
            hourly_rate REAL DEFAULT 0,
            hours_worked REAL DEFAULT 0,
            gross_total  REAL GENERATED ALWAYS AS (hourly_rate * hours_worked + tips) STORED,
            source       TEXT DEFAULT 'csv',
            imported_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            plaid_txn_id    TEXT UNIQUE,
            txn_date        TEXT NOT NULL,
            amount          REAL NOT NULL,
            direction       TEXT NOT NULL CHECK(direction IN ('debit','credit')),
            merchant_hash   TEXT,
            category        TEXT,
            account_id      TEXT,
            imported_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            plaid_id    TEXT UNIQUE,
            name_hash   TEXT,
            type        TEXT,
            subtype     TEXT,
            balance     REAL,
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS liabilities (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name_hash       TEXT,
            amount          REAL NOT NULL,
            due_date        TEXT,
            category        TEXT,
            is_recurring    INTEGER DEFAULT 1,
            updated_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_date   TEXT NOT NULL,
            gross_earned    REAL DEFAULT 0,
            bank_deposits   REAL DEFAULT 0,
            cash_on_hand    REAL DEFAULT 0,
            bleed           REAL GENERATED ALWAYS AS (gross_earned - bank_deposits - cash_on_hand) STORED,
            current_balance REAL DEFAULT 0,
            upcoming_bills  REAL DEFAULT 0,
            savings_goal    REAL DEFAULT 0,
            essential_budget REAL DEFAULT 0,
            safe_to_spend   REAL GENERATED ALWAYS AS
                (current_balance - upcoming_bills - savings_goal - essential_budget) STORED,
            created_at      TEXT DEFAULT (datetime('now'))
        );
    """)

    conn.commit()
    conn.close()
    log.info("Database initialized at %s", DB_PATH)


def get_connection() -> sqlite3.Connection:
    conn = _get_connection()
    conn.row_factory = sqlite3.Row
    return conn
