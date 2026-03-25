"""
Phase 2 – Source B: Plaid Integration
Pulls transactions, balances, and liabilities from Plaid Sandbox.
All merchant names are hashed before storage — raw PII never hits the DB.
"""

import os
import hashlib
import logging
from datetime import date, timedelta
from dotenv import load_dotenv

import plaid
from plaid.api import plaid_api
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.liabilities_get_request import LiabilitiesGetRequest

load_dotenv()
log = logging.getLogger("plaid_client")

_ENV_MAP = {
    "sandbox": plaid.Environment.Sandbox,
    "development": plaid.Environment.Development,
    "production": plaid.Environment.Production,
}


def _get_client() -> plaid_api.PlaidApi:
    env_str = os.getenv("PLAID_ENV", "sandbox").lower()
    configuration = plaid.Configuration(
        host=_ENV_MAP.get(env_str, plaid.Environment.Sandbox),
        api_key={
            "clientId": os.getenv("PLAID_CLIENT_ID"),
            "secret": os.getenv("PLAID_SECRET"),
        },
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


def _hash(value: str) -> str:
    """One-way hash for merchant/account names — preserves grouping, removes PII."""
    if not value:
        return ""
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()[:16]


def fetch_transactions(days_back: int = 90) -> list[dict]:
    """Fetch and anonymize transactions for the last N days."""
    client = _get_client()
    access_token = os.getenv("PLAID_ACCESS_TOKEN")
    end = date.today()
    start = end - timedelta(days=days_back)

    request = TransactionsGetRequest(
        access_token=access_token,
        start_date=start,
        end_date=end,
        options=TransactionsGetRequestOptions(count=500, offset=0),
    )
    response = client.transactions_get(request)
    txns = response["transactions"]

    results = []
    for t in txns:
        amount = t["amount"]
        results.append({
            "plaid_txn_id": t["transaction_id"],
            "txn_date": str(t["date"]),
            "amount": abs(amount),
            "direction": "debit" if amount > 0 else "credit",
            "merchant_hash": _hash(t.get("merchant_name") or t.get("name", "")),
            "category": (t.get("category") or ["Uncategorized"])[0],
            "account_id": t["account_id"],
        })

    log.info("Fetched %d transactions from Plaid (%s to %s)", len(results), start, end)
    return results


def fetch_accounts() -> list[dict]:
    """Fetch account balances."""
    client = _get_client()
    access_token = os.getenv("PLAID_ACCESS_TOKEN")
    response = client.accounts_get(AccountsGetRequest(access_token=access_token))

    results = []
    for a in response["accounts"]:
        results.append({
            "plaid_id": a["account_id"],
            "name_hash": _hash(a.get("name", "")),
            "type": str(a["type"]),
            "subtype": str(a.get("subtype", "")),
            "balance": a["balances"].get("current") or 0.0,
        })

    log.info("Fetched %d accounts from Plaid", len(results))
    return results


def fetch_liabilities() -> list[dict]:
    """Fetch recurring liabilities (credit cards, student loans, mortgages)."""
    client = _get_client()
    access_token = os.getenv("PLAID_ACCESS_TOKEN")
    response = client.liabilities_get(LiabilitiesGetRequest(access_token=access_token))
    liabilities_data = response["liabilities"]

    results = []

    # Credit cards
    for cc in (liabilities_data.get("credit") or []):
        results.append({
            "name_hash": _hash(cc.get("name", "")),
            "amount": cc.get("last_statement_balance") or 0.0,
            "due_date": str(cc.get("next_payment_due_date") or ""),
            "category": "credit_card",
            "is_recurring": 1,
        })

    # Student loans
    for sl in (liabilities_data.get("student") or []):
        results.append({
            "name_hash": _hash(sl.get("loan_name", "")),
            "amount": sl.get("last_payment_amount") or 0.0,
            "due_date": str(sl.get("next_payment_due_date") or ""),
            "category": "student_loan",
            "is_recurring": 1,
        })

    log.info("Fetched %d liabilities from Plaid", len(results))
    return results


def save_transactions(txns: list[dict], conn) -> int:
    cur = conn.cursor()
    inserted = 0
    for t in txns:
        cur.execute(
            """
            INSERT OR IGNORE INTO transactions
              (plaid_txn_id, txn_date, amount, direction, merchant_hash, category, account_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (t["plaid_txn_id"], t["txn_date"], t["amount"], t["direction"],
             t["merchant_hash"], t["category"], t["account_id"]),
        )
        if cur.rowcount:
            inserted += 1
    conn.commit()
    log.info("Inserted %d new transactions", inserted)
    return inserted


def save_accounts(accounts: list[dict], conn) -> None:
    cur = conn.cursor()
    for a in accounts:
        cur.execute(
            """
            INSERT INTO accounts (plaid_id, name_hash, type, subtype, balance, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(plaid_id) DO UPDATE SET
              balance = excluded.balance,
              updated_at = excluded.updated_at
            """,
            (a["plaid_id"], a["name_hash"], a["type"], a["subtype"], a["balance"]),
        )
    conn.commit()


def save_liabilities(liabilities: list[dict], conn) -> None:
    cur = conn.cursor()
    # Wipe and re-insert liabilities on each sync to keep them fresh
    cur.execute("DELETE FROM liabilities")
    for li in liabilities:
        cur.execute(
            """
            INSERT INTO liabilities (name_hash, amount, due_date, category, is_recurring)
            VALUES (?, ?, ?, ?, ?)
            """,
            (li["name_hash"], li["amount"], li["due_date"], li["category"], li["is_recurring"]),
        )
    conn.commit()


def get_current_balance(conn) -> float:
    cur = conn.cursor()
    cur.execute("SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE type = 'depository'")
    return cur.fetchone()[0]


def get_bank_deposits(conn, start_date: str = None, end_date: str = None) -> float:
    cur = conn.cursor()
    if start_date and end_date:
        cur.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE direction='credit' AND txn_date BETWEEN ? AND ?",
            (start_date, end_date),
        )
    else:
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE direction='credit'")
    return cur.fetchone()[0]


def get_upcoming_bills(conn, within_days: int = 30) -> float:
    """Sum all recurring liabilities due within the next N days."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COALESCE(SUM(amount), 0) FROM liabilities
        WHERE is_recurring = 1
          AND (due_date = '' OR due_date <= date('now', ?))
        """,
        (f"+{within_days} days",),
    )
    return cur.fetchone()[0]
