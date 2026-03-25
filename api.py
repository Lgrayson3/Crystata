"""
Flask API backend — used by the Android WebView app.
Exposes the same core logic as app.py but as a REST API.
"""

import os
import logging
from flask import Flask, jsonify, request
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("api")


def create_app() -> Flask:
    app = Flask(__name__, static_folder="android_app/assets/www", static_url_path="")

    from database import init_db, get_connection
    from reconciliation import compute_snapshot, save_snapshot, get_snapshot_history
    from advisor import generate_weekend_forecast, fetch_transactions_for_advisor, fetch_liabilities_for_advisor

    init_db()

    # ── Snapshot ──────────────────────────────────────────────────────────────
    @app.route("/api/snapshot")
    def snapshot():
        try:
            data = compute_snapshot(
                start_date=request.args.get("start"),
                end_date=request.args.get("end"),
                cash_on_hand=_float_arg("cash"),
                savings_goal=_float_arg("savings"),
                essential_budget=_float_arg("budget"),
            )
            return jsonify(data)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/snapshot/save", methods=["POST"])
    def snapshot_save():
        try:
            body = request.get_json(force=True) or {}
            save_snapshot(body)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/history")
    def history():
        try:
            limit = int(request.args.get("limit", 30))
            return jsonify(get_snapshot_history(limit=limit))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── Plaid sync ────────────────────────────────────────────────────────────
    @app.route("/api/sync/plaid", methods=["POST"])
    def sync_plaid():
        try:
            from ingestion.plaid_client import (
                fetch_transactions, fetch_accounts, fetch_liabilities,
                save_transactions, save_accounts, save_liabilities,
            )
            conn = get_connection()
            txns = fetch_transactions(days_back=90)
            accts = fetch_accounts()
            liabs = fetch_liabilities()
            n_txns = save_transactions(txns, conn)
            save_accounts(accts, conn)
            save_liabilities(liabs, conn)
            conn.close()
            return jsonify({"inserted_transactions": n_txns, "accounts": len(accts), "liabilities": len(liabs)})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── Work log CSV upload ───────────────────────────────────────────────────
    @app.route("/api/sync/worklog", methods=["POST"])
    def sync_worklog():
        try:
            from ingestion.work_logs import fetch_grayson_rows, save_work_logs
            import tempfile, shutil
            f = request.files.get("file")
            if not f:
                return jsonify({"error": "No file uploaded"}), 400
            with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
                f.save(tmp.name)
                df = fetch_grayson_rows(csv_path=tmp.name)
            conn = get_connection()
            n = save_work_logs(df, conn)
            conn.close()
            return jsonify({"inserted": n})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── AI Forecast ───────────────────────────────────────────────────────────
    @app.route("/api/forecast")
    def forecast():
        try:
            safe = _float_arg("safe_to_spend") or 0.0
            bleed = _float_arg("bleed") or 0.0
            conn = get_connection()
            text = generate_weekend_forecast(conn=conn, safe_to_spend=safe, bleed=bleed)
            conn.close()
            return jsonify({"forecast": text})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── Serve mobile UI ───────────────────────────────────────────────────────
    @app.route("/")
    def index():
        return app.send_static_file("index.html")

    return app


def _float_arg(key: str):
    v = request.args.get(key)
    try:
        return float(v) if v is not None else None
    except (ValueError, TypeError):
        return None


if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=False)
