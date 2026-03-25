"""
Phase 2 – Reconciliation Engine
Combines Work Logs + Bank Reality to compute The Bleed and Safe-to-Spend.
"""

import os
import logging
from datetime import datetime, date
from dotenv import load_dotenv

from database import get_connection
from ingestion.work_logs import get_gross_earned
from ingestion.plaid_client import get_current_balance, get_bank_deposits, get_upcoming_bills

load_dotenv()
log = logging.getLogger("reconciliation")


def compute_snapshot(
    start_date: str = None,
    end_date: str = None,
    cash_on_hand: float = None,
    savings_goal: float = None,
    essential_budget: float = None,
) -> dict:
    """
    Core reconciliation logic.

    The Bleed    = Gross Earned − (Bank Deposits + Cash on Hand)
    Safe-to-Spend = Current Balance − (Upcoming Bills + Savings Goal + Essential Budget)
    """
    # Pull env defaults if not explicitly passed
    cash_on_hand = cash_on_hand if cash_on_hand is not None else float(os.getenv("CASH_ON_HAND", 0))
    savings_goal = savings_goal if savings_goal is not None else float(os.getenv("SAVINGS_GOAL_MONTHLY", 0))
    essential_budget = essential_budget if essential_budget is not None else float(os.getenv("ESSENTIAL_BUDGET_WEEKLY", 0)) * 4

    today = date.today().isoformat()
    start = start_date or today[:7] + "-01"  # first of current month
    end = end_date or today

    conn = get_connection()
    try:
        gross_earned = get_gross_earned(conn, start, end)
        bank_deposits = get_bank_deposits(conn, start, end)
        current_balance = get_current_balance(conn)
        upcoming_bills = get_upcoming_bills(conn, within_days=30)
    finally:
        conn.close()

    bleed = gross_earned - (bank_deposits + cash_on_hand)
    safe_to_spend = current_balance - (upcoming_bills + savings_goal + essential_budget)

    snapshot = {
        "snapshot_date": today,
        "period_start": start,
        "period_end": end,
        "gross_earned": round(gross_earned, 2),
        "bank_deposits": round(bank_deposits, 2),
        "cash_on_hand": round(cash_on_hand, 2),
        "bleed": round(bleed, 2),
        "current_balance": round(current_balance, 2),
        "upcoming_bills": round(upcoming_bills, 2),
        "savings_goal": round(savings_goal, 2),
        "essential_budget": round(essential_budget, 2),
        "safe_to_spend": round(safe_to_spend, 2),
    }

    log.info(
        "Snapshot | Gross: $%.2f | Bleed: $%.2f | Safe-to-Spend: $%.2f",
        gross_earned, bleed, safe_to_spend,
    )
    return snapshot


def save_snapshot(snapshot: dict) -> None:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO snapshots
              (snapshot_date, gross_earned, bank_deposits, cash_on_hand,
               current_balance, upcoming_bills, savings_goal, essential_budget)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot["snapshot_date"],
                snapshot["gross_earned"],
                snapshot["bank_deposits"],
                snapshot["cash_on_hand"],
                snapshot["current_balance"],
                snapshot["upcoming_bills"],
                snapshot["savings_goal"],
                snapshot["essential_budget"],
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_snapshot_history(limit: int = 30) -> list[dict]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT snapshot_date, gross_earned, bank_deposits, cash_on_hand,
                   bleed, current_balance, upcoming_bills, safe_to_spend
            FROM snapshots
            ORDER BY snapshot_date DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()
