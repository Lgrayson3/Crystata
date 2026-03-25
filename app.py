"""
The Grayson Ledger – Streamlit Dashboard
Run with: streamlit run app.py
"""

import os
import logging
import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv()

# ── Local imports ──────────────────────────────────────────────────────────────
from database import init_db, get_connection
from reconciliation import compute_snapshot, save_snapshot, get_snapshot_history
from advisor import generate_weekend_forecast

logging.basicConfig(level=logging.INFO)

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="The Grayson Ledger",
    page_icon="💵",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Init DB on first run ───────────────────────────────────────────────────────
init_db()

# ── Custom CSS ─────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  .metric-card {
    background: #1e1e2e;
    border-radius: 12px;
    padding: 1.2rem 1.5rem;
    margin-bottom: 0.5rem;
  }
  .bleed-positive { color: #f38ba8; font-weight: 700; }
  .bleed-zero     { color: #a6e3a1; font-weight: 700; }
  .safe-positive  { color: #a6e3a1; font-weight: 700; }
  .safe-negative  { color: #f38ba8; font-weight: 700; }
  .section-header { font-size: 1.1rem; font-weight: 600; margin-top: 1rem; }
</style>
""", unsafe_allow_html=True)

# ══════════════════════════════════════════════════════════════════════════════
# SIDEBAR
# ══════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.title("⚙️ Controls")

    st.subheader("Date Range")
    col_s, col_e = st.columns(2)
    start_date = col_s.date_input("From", value=date.today().replace(day=1))
    end_date = col_e.date_input("To", value=date.today())

    st.divider()

    st.subheader("Manual Overrides")
    cash_on_hand = st.number_input("Cash on Hand ($)", min_value=0.0, value=float(os.getenv("CASH_ON_HAND", 0)), step=5.0)
    savings_goal = st.number_input("Savings Goal / Mo ($)", min_value=0.0, value=float(os.getenv("SAVINGS_GOAL_MONTHLY", 0)), step=10.0)
    essential_budget = st.number_input("Essential Budget / Wk ($)", min_value=0.0, value=float(os.getenv("ESSENTIAL_BUDGET_WEEKLY", 0)), step=10.0)

    st.divider()

    st.subheader("Data Sync")
    sync_plaid = st.button("🔄 Sync Plaid", use_container_width=True)
    sync_sheet = st.button("📊 Sync Work Log", use_container_width=True)
    uploaded_csv = st.file_uploader("Or upload CSV", type=["csv"])

    st.divider()

    st.subheader("Import Work Log CSV")
    if uploaded_csv:
        import tempfile, shutil
        from ingestion.work_logs import fetch_grayson_rows, save_work_logs
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            shutil.copyfileobj(uploaded_csv, tmp)
            tmp_path = tmp.name
        try:
            df_logs = fetch_grayson_rows(csv_path=tmp_path)
            conn = get_connection()
            n = save_work_logs(df_logs, conn)
            conn.close()
            st.success(f"Imported {n} new rows for Grayson.")
        except Exception as e:
            st.error(f"Import failed: {e}")

# ── Plaid sync handler ─────────────────────────────────────────────────────────
if sync_plaid:
    from ingestion.plaid_client import (
        fetch_transactions, fetch_accounts, fetch_liabilities,
        save_transactions, save_accounts, save_liabilities,
    )
    try:
        with st.spinner("Syncing Plaid…"):
            conn = get_connection()
            txns = fetch_transactions(days_back=90)
            accts = fetch_accounts()
            liabs = fetch_liabilities()
            save_transactions(txns, conn)
            save_accounts(accts, conn)
            save_liabilities(liabs, conn)
            conn.close()
        st.sidebar.success("Plaid synced.")
    except Exception as e:
        st.sidebar.error(f"Plaid sync failed: {e}")

if sync_sheet:
    if not (os.getenv("GOOGLE_SHEET_ID") and os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON")):
        st.sidebar.warning("Set GOOGLE_SHEET_ID and GOOGLE_SHEETS_CREDENTIALS_JSON in .env to sync Google Sheets.")
    else:
        from ingestion.work_logs import fetch_grayson_rows, save_work_logs
        try:
            with st.spinner("Syncing Google Sheet…"):
                df_logs = fetch_grayson_rows()
                conn = get_connection()
                n = save_work_logs(df_logs, conn)
                conn.close()
            st.sidebar.success(f"Synced {n} new work log rows.")
        except Exception as e:
            st.sidebar.error(f"Sheet sync failed: {e}")

# ══════════════════════════════════════════════════════════════════════════════
# MAIN CONTENT
# ══════════════════════════════════════════════════════════════════════════════
st.title("💵 The Grayson Ledger")
st.caption(f"Private financial intelligence · {date.today().strftime('%B %d, %Y')}")

# ── Compute snapshot ───────────────────────────────────────────────────────────
snapshot = compute_snapshot(
    start_date=start_date.isoformat(),
    end_date=end_date.isoformat(),
    cash_on_hand=cash_on_hand,
    savings_goal=savings_goal,
    essential_budget=essential_budget * 4,
)

# ── Top KPI row ────────────────────────────────────────────────────────────────
kpi1, kpi2, kpi3, kpi4 = st.columns(4)

kpi1.metric("💰 Gross Earned", f"${snapshot['gross_earned']:,.2f}", help="Tips + Hourly from work logs")
kpi2.metric("🏦 Bank Deposits", f"${snapshot['bank_deposits']:,.2f}", help="Credits into your accounts (Plaid)")
kpi3.metric(
    "🩸 The Bleed",
    f"${snapshot['bleed']:,.2f}",
    delta=None,
    help="Gross Earned − (Bank Deposits + Cash on Hand). Untracked cash."
)
kpi4.metric(
    "✅ Safe-to-Spend",
    f"${snapshot['safe_to_spend']:,.2f}",
    help="Current Balance − (Upcoming Bills + Savings Goal + Essential Budget)"
)

# ── Bleed breakdown bar ────────────────────────────────────────────────────────
st.divider()
col_left, col_right = st.columns([3, 2])

with col_left:
    st.subheader("Reconciliation Breakdown")

    fig = go.Figure(go.Bar(
        x=["Gross Earned", "Bank Deposits", "Cash on Hand", "The Bleed"],
        y=[
            snapshot["gross_earned"],
            snapshot["bank_deposits"],
            snapshot["cash_on_hand"],
            max(snapshot["bleed"], 0),
        ],
        marker_color=["#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8"],
        text=[
            f"${snapshot['gross_earned']:,.0f}",
            f"${snapshot['bank_deposits']:,.0f}",
            f"${snapshot['cash_on_hand']:,.0f}",
            f"${max(snapshot['bleed'], 0):,.0f}",
        ],
        textposition="outside",
    ))
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font_color="#cdd6f4",
        yaxis_title="USD",
        showlegend=False,
        height=320,
        margin=dict(t=10, b=10),
    )
    st.plotly_chart(fig, use_container_width=True)

with col_right:
    st.subheader("Safe-to-Spend Waterfall")

    fig2 = go.Figure(go.Waterfall(
        orientation="v",
        measure=["absolute", "relative", "relative", "relative", "total"],
        x=["Balance", "− Bills", "− Savings", "− Budget", "Safe-to-Spend"],
        y=[
            snapshot["current_balance"],
            -snapshot["upcoming_bills"],
            -snapshot["savings_goal"],
            -snapshot["essential_budget"],
            0,
        ],
        connector={"line": {"color": "#6c7086"}},
        increasing={"marker": {"color": "#a6e3a1"}},
        decreasing={"marker": {"color": "#f38ba8"}},
        totals={"marker": {"color": "#89b4fa"}},
        texttemplate="%{y:$,.0f}",
    ))
    fig2.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font_color="#cdd6f4",
        showlegend=False,
        height=320,
        margin=dict(t=10, b=10),
    )
    st.plotly_chart(fig2, use_container_width=True)

# ── Trend chart ────────────────────────────────────────────────────────────────
st.divider()
history = get_snapshot_history(limit=30)
if history:
    st.subheader("Historical Snapshots")
    df_hist = pd.DataFrame(history)
    fig3 = px.line(
        df_hist.sort_values("snapshot_date"),
        x="snapshot_date", y=["bleed", "safe_to_spend"],
        color_discrete_map={"bleed": "#f38ba8", "safe_to_spend": "#a6e3a1"},
        labels={"value": "USD", "snapshot_date": "Date", "variable": "Metric"},
    )
    fig3.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font_color="#cdd6f4",
        height=260,
        margin=dict(t=10, b=10),
    )
    st.plotly_chart(fig3, use_container_width=True)
else:
    st.info("No historical snapshots yet. Click 'Save Snapshot' after syncing data.")

save_col, _ = st.columns([1, 4])
if save_col.button("💾 Save Today's Snapshot"):
    save_snapshot(snapshot)
    st.success("Snapshot saved.")

# ── AI Advisor ─────────────────────────────────────────────────────────────────
st.divider()
st.subheader("🤖 Weekend Spend Forecast (AI Advisor)")

if st.button("Generate Forecast", use_container_width=False):
    with st.spinner("Analyzing scrubbed transaction data via Gemini…"):
        conn = get_connection()
        forecast = generate_weekend_forecast(
            conn=conn,
            safe_to_spend=snapshot["safe_to_spend"],
            bleed=snapshot["bleed"],
        )
        conn.close()
    st.markdown(forecast)
    st.caption("⚠️ All merchant names were replaced with category tokens before being sent to the AI. No PII left this device.")
else:
    st.caption("Click to generate a personalized weekend spending forecast powered by Gemini 1.5 Flash.")

# ── Footer ─────────────────────────────────────────────────────────────────────
st.divider()
st.caption("🔒 Zero-Cloud · Local-First · No financial data leaves this machine except direct API calls to Plaid & Gemini")
