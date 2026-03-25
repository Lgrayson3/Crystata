# The Grayson Ledger

A local-first, zero-knowledge financial intelligence tool for a tipped professional.

## What It Does

Reconciles **Gross Earnings** (from a daily spreadsheet) with **Bank Reality** (via Plaid) to identify **"The Bleed"** — untracked cash spending — and calculates a **Safe-to-Spend** figure.

```
The Bleed      = (Tips + Hourly) − (Bank Deposits + Cash on Hand)
Safe-to-Spend  = Current Balance − (Upcoming Bills + Savings Goal + Essential Budget)
```

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your Plaid, Google Sheets, and Gemini credentials
```

### 3. Run the dashboard
```bash
streamlit run app.py
```

---

## Architecture

| Module | Purpose |
|---|---|
| `app.py` | Streamlit dashboard UI |
| `database.py` | SQLite (encrypted at rest via sqlcipher3) |
| `reconciliation.py` | Core Bleed + Safe-to-Spend calculations |
| `sentry.py` | Phase 1: Performance Guard — scans & purges non-essential processes |
| `ingestion/work_logs.py` | Phase 2: Google Sheets / CSV ingestion (Grayson rows only) |
| `ingestion/plaid_client.py` | Phase 2: Plaid Sandbox — transactions, balances, liabilities |
| `advisor.py` | Phase 3: Gemini 1.5 Flash — Weekend Spend Forecast (scrubbed data only) |

---

## Security Model

- **Zero-Cloud**: No financial data leaves the local machine except direct API calls to Plaid and Gemini.
- **Scrubbing**: All merchant names are SHA-256 hashed before touching the database or being sent to any LLM. Only category, amount, direction, and date are passed to Gemini.
- **Encryption**: SQLite database is encrypted at rest using `sqlcipher3` when `DB_ENCRYPTION_KEY` is set in `.env`.
- **`.env` hygiene**: All credentials live in `.env` (git-ignored). Never committed.

---

## Data Sources

### Source A — Work Logs (Google Sheet or CSV)
Expected columns: `Date`, `Name`, `Tips`, `Hourly Rate`, `Hours Worked`

Only rows where `Name == "Grayson"` are imported.

### Source B — Bank Reality (Plaid Sandbox)
- Transactions (last 90 days)
- Account balances
- Liabilities (credit cards, student loans)

Set `PLAID_ENV=sandbox` for development.

---

## Phases

1. **Phase 1 – Sentry**: `sentry.py` — CPU/RAM monitor, non-essential process scanner/terminator
2. **Phase 2 – Reconciliation Engine**: `ingestion/` + `reconciliation.py` — data ingestion and Bleed/Safe-to-Spend math
3. **Phase 3 – Advisor**: `advisor.py` — Gemini-powered Weekend Spend Forecast using only scrubbed data
