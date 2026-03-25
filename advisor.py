"""
Phase 3 – The Advisor (Gemini Integration)
Analyzes scrubbed transaction data and generates a Weekend Spend Forecast.
All raw merchant names are replaced with hashed tokens before the LLM ever sees them.
"""

import os
import logging
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("advisor")

GEMINI_MODEL = "gemini-1.5-flash"


def _scrub_transactions(transactions: list[dict]) -> list[dict]:
    """
    Remove all PII / identifiable merchant info before sending to an LLM.
    Only category, direction, amount, and date are preserved.
    """
    scrubbed = []
    for t in transactions:
        scrubbed.append({
            "date": t.get("txn_date", ""),
            "amount": t.get("amount", 0),
            "direction": t.get("direction", ""),
            "category": t.get("category", "Uncategorized"),
            # merchant_hash is already a SHA-256 stub — safe to pass for grouping
            "merchant_token": t.get("merchant_hash", ""),
        })
    return scrubbed


def _scrub_liabilities(liabilities: list[dict]) -> list[dict]:
    return [
        {
            "category": li.get("category", ""),
            "amount": li.get("amount", 0),
            "due_date": li.get("due_date", ""),
        }
        for li in liabilities
    ]


def _build_prompt(
    scrubbed_txns: list[dict],
    scrubbed_bills: list[dict],
    safe_to_spend: float,
    bleed: float,
) -> str:
    weekend_start = _next_friday()
    weekend_end = weekend_start + timedelta(days=2)

    txn_summary = "\n".join(
        f"  {t['date']} | {t['direction'].upper()} | ${t['amount']:.2f} | {t['category']}"
        for t in scrubbed_txns[-40:]  # last 40 transactions
    )
    bills_summary = "\n".join(
        f"  {b['category']} | ${b['amount']:.2f} | due {b['due_date'] or 'recurring'}"
        for b in scrubbed_bills
    )

    return f"""You are a private financial coach for a tipped professional.
All merchant names have been replaced with category labels to protect privacy.

## Current Situation
- Safe-to-Spend (after bills + savings): ${safe_to_spend:.2f}
- Untracked Cash (The Bleed): ${bleed:.2f}

## Recent Transactions (scrubbed)
{txn_summary if txn_summary else "  No recent transactions."}

## Upcoming Bills
{bills_summary if bills_summary else "  No upcoming bills."}

## Your Task
Analyze the spending patterns and provide a concise Weekend Spend Forecast for {weekend_start.strftime('%A, %b %d')} – {weekend_end.strftime('%A, %b %d')}.

Include:
1. A recommended daily spend ceiling for the weekend
2. The top 2 spending categories to watch
3. One actionable tip to reduce The Bleed
4. A plain-English risk assessment: LOW / MODERATE / HIGH

Keep the response under 200 words. Be direct and practical."""


def _next_friday() -> date:
    today = date.today()
    days_until_friday = (4 - today.weekday()) % 7
    if days_until_friday == 0:
        days_until_friday = 7
    return today + timedelta(days=days_until_friday)


def fetch_transactions_for_advisor(conn, days_back: int = 30) -> list[dict]:
    """Pull raw transaction rows from the local DB for the advisor."""
    cur = conn.cursor()
    cutoff = (date.today() - timedelta(days=days_back)).isoformat()
    cur.execute(
        """
        SELECT txn_date, amount, direction, category, merchant_hash
        FROM transactions
        WHERE txn_date >= ?
        ORDER BY txn_date DESC
        """,
        (cutoff,),
    )
    return [dict(row) for row in cur.fetchall()]


def fetch_liabilities_for_advisor(conn) -> list[dict]:
    cur = conn.cursor()
    cur.execute("SELECT category, amount, due_date FROM liabilities WHERE is_recurring = 1")
    return [dict(row) for row in cur.fetchall()]


def generate_weekend_forecast(
    conn,
    safe_to_spend: float,
    bleed: float,
) -> str:
    """
    Generate a Weekend Spend Forecast using Gemini 1.5 Flash.
    Returns the model's text response.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return (
            "GEMINI_API_KEY not set. Add it to your .env file to enable the AI Advisor.\n"
            f"\nCurrent snapshot: Safe-to-Spend=${safe_to_spend:.2f} | The Bleed=${bleed:.2f}"
        )

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(GEMINI_MODEL)

        raw_txns = fetch_transactions_for_advisor(conn)
        raw_bills = fetch_liabilities_for_advisor(conn)

        scrubbed_txns = _scrub_transactions(raw_txns)
        scrubbed_bills = _scrub_liabilities(raw_bills)

        prompt = _build_prompt(scrubbed_txns, scrubbed_bills, safe_to_spend, bleed)

        log.info("Sending scrubbed data to Gemini (%s transactions, %s bills)", len(scrubbed_txns), len(scrubbed_bills))
        response = model.generate_content(prompt)
        return response.text

    except Exception as e:
        log.error("Gemini call failed: %s", e)
        return f"Advisor temporarily unavailable: {e}"
