"""
Phase 2 – Source A: Work Log Ingestion
Reads "Grayson" rows from a Google Sheet or local CSV and loads them into SQLite.
"""

import os
import io
import csv
import logging
from datetime import datetime
from dotenv import load_dotenv

try:
    import pandas as pd
    _HAS_PANDAS = True
except ImportError:
    _HAS_PANDAS = False

load_dotenv()
log = logging.getLogger("work_logs")

SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "")
SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "Sheet1")
CREDS_PATH = os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON", "")

# Column name mapping — adjust to match the actual spreadsheet headers
COL_MAP = {
    "date": ["date", "Date", "DATE", "work date", "Work Date"],
    "name": ["name", "Name", "NAME", "employee", "Employee"],
    "tips": ["tips", "Tips", "TIPS", "tip", "Tip"],
    "hourly_rate": ["hourly rate", "hourly_rate", "Hourly Rate", "rate", "Rate", "Hourly"],
    "hours_worked": ["hours", "hours worked", "Hours", "Hours Worked", "hours_worked"],
}


def _canonical_col(header: str) -> str:
    """Map a raw header string to a canonical column name, or return it unchanged."""
    h = header.strip()
    for canonical, variants in COL_MAP.items():
        if h in variants:
            return canonical
    return h


def _clean_number(val) -> float:
    try:
        return float(str(val).replace("$", "").replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _parse_date(val) -> str:
    """Return ISO date string or empty string on failure."""
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%B %d, %Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def _rows_to_records(raw_rows: list[dict]) -> list[dict]:
    """Normalize column names and clean values; return list of dicts."""
    records = []
    for row in raw_rows:
        norm = {_canonical_col(k): v for k, v in row.items()}
        if norm.get("name", "").strip().lower() != "grayson":
            continue
        date_str = _parse_date(norm.get("date", ""))
        if not date_str:
            continue
        records.append({
            "date": date_str,
            "tips": _clean_number(norm.get("tips", 0)),
            "hourly_rate": _clean_number(norm.get("hourly_rate", 0)),
            "hours_worked": _clean_number(norm.get("hours_worked", 0)),
        })
    return records


def _load_csv_records(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _load_from_google_sheets() -> list[dict]:
    import gspread
    from google.oauth2.service_account import Credentials

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    creds = Credentials.from_service_account_file(CREDS_PATH, scopes=scopes)
    gc = gspread.authorize(creds)
    ws = gc.open_by_key(SHEET_ID).worksheet(SHEET_NAME)
    return ws.get_all_records()


def fetch_grayson_rows(csv_path: str = None):
    """
    Pull rows from the spreadsheet, filter for Name == 'Grayson',
    and return a list of clean dicts (or a DataFrame if pandas is available).
    """
    if csv_path:
        raw = _load_csv_records(csv_path)
        source = "csv"
    elif SHEET_ID and CREDS_PATH:
        raw = _load_from_google_sheets()
        source = "google_sheets"
    else:
        raise ValueError(
            "Provide either a csv_path or set GOOGLE_SHEET_ID + "
            "GOOGLE_SHEETS_CREDENTIALS_JSON in .env"
        )

    records = _rows_to_records(raw)
    if not records:
        raise ValueError("No 'Grayson' rows found after filtering.")

    for r in records:
        r["source"] = source

    # Return a DataFrame when pandas is available (desktop Streamlit app),
    # otherwise return the list of dicts (Android / no-pandas environments).
    log.info("Fetched %d Grayson rows from %s", len(records), source)
    if _HAS_PANDAS:
        return pd.DataFrame(records)
    return records


def save_work_logs(rows, conn) -> int:
    """Upsert work log rows into the database. Accepts a DataFrame or list of dicts."""
    cur = conn.cursor()
    inserted = 0

    # Normalise to an iterable of dicts
    if _HAS_PANDAS and isinstance(rows, pd.DataFrame):
        iter_rows = (r for _, r in rows.iterrows())
    else:
        iter_rows = iter(rows)

    for row in iter_rows:
        cur.execute(
            """
            INSERT OR IGNORE INTO work_logs (log_date, tips, hourly_rate, hours_worked, source)
            VALUES (?, ?, ?, ?, ?)
            """,
            (row["date"], row["tips"], row["hourly_rate"], row["hours_worked"], row.get("source", "csv")),
        )
        if cur.rowcount:
            inserted += 1

    conn.commit()
    log.info("Inserted %d new work log rows", inserted)
    return inserted


def get_gross_earned(conn, start_date: str = None, end_date: str = None) -> float:
    """Sum gross_total for a date range (or all time)."""
    cur = conn.cursor()
    if start_date and end_date:
        cur.execute(
            "SELECT COALESCE(SUM(gross_total), 0) FROM work_logs WHERE log_date BETWEEN ? AND ?",
            (start_date, end_date),
        )
    else:
        cur.execute("SELECT COALESCE(SUM(gross_total), 0) FROM work_logs")
    return cur.fetchone()[0]
