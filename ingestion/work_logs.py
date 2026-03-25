"""
Phase 2 – Source A: Work Log Ingestion
Reads "Grayson" rows from a Google Sheet or local CSV and loads them into SQLite.
"""

import os
import io
import logging
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

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


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remap whatever headers exist in the sheet to our canonical names."""
    rename = {}
    for canonical, variants in COL_MAP.items():
        for col in df.columns:
            if col.strip() in variants:
                rename[col] = canonical
                break
    return df.rename(columns=rename)


def _load_from_google_sheets() -> pd.DataFrame:
    import gspread
    from google.oauth2.service_account import Credentials

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    creds = Credentials.from_service_account_file(CREDS_PATH, scopes=scopes)
    gc = gspread.authorize(creds)
    ws = gc.open_by_key(SHEET_ID).worksheet(SHEET_NAME)
    rows = ws.get_all_records()
    return pd.DataFrame(rows)


def _load_from_csv(path: str) -> pd.DataFrame:
    return pd.read_csv(path)


def fetch_grayson_rows(csv_path: str = None) -> pd.DataFrame:
    """
    Pull rows from the spreadsheet, filter for Name == 'Grayson',
    and return a clean DataFrame.
    """
    if csv_path:
        df = _load_from_csv(csv_path)
        source = "csv"
    elif SHEET_ID and CREDS_PATH:
        df = _load_from_google_sheets()
        source = "google_sheets"
    else:
        raise ValueError(
            "Provide either a csv_path or set GOOGLE_SHEET_ID + "
            "GOOGLE_SHEETS_CREDENTIALS_JSON in .env"
        )

    df = _normalize_columns(df)

    required = {"date", "name", "tips", "hourly_rate", "hours_worked"}
    missing = required - set(df.columns)
    if missing:
        raise KeyError(f"Spreadsheet is missing columns: {missing}")

    # Filter for Grayson only
    df = df[df["name"].str.strip().str.lower() == "grayson"].copy()

    # Clean numeric fields
    for col in ["tips", "hourly_rate", "hours_worked"]:
        df[col] = (
            df[col]
            .astype(str)
            .str.replace(r"[\$,]", "", regex=True)
            .str.strip()
            .pipe(pd.to_numeric, errors="coerce")
            .fillna(0)
        )

    # Parse dates
    df["date"] = pd.to_datetime(df["date"], infer_datetime_format=True, errors="coerce")
    df = df.dropna(subset=["date"])
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")

    df["source"] = source
    log.info("Fetched %d Grayson rows from %s", len(df), source)
    return df


def save_work_logs(df: pd.DataFrame, conn) -> int:
    """Upsert work log rows into the database. Returns count inserted."""
    cur = conn.cursor()
    inserted = 0

    for _, row in df.iterrows():
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
