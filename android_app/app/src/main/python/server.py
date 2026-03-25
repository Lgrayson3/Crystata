"""
Entry point called by Chaquopy from MainActivity.
Sets up the data directory and starts the Flask server.
"""
import os
import sys


def start():
    # Point the app to internal storage for the DB and .env
    data_dir = _get_data_dir()
    os.environ.setdefault("DB_PATH", os.path.join(data_dir, "ledger.db"))

    env_file = os.path.join(data_dir, ".env")
    if os.path.exists(env_file):
        from dotenv import load_dotenv
        load_dotenv(env_file, override=False)

    # Add the project root to sys.path so all modules are importable
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    import api as api_module
    app = api_module.create_app()
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)


def _get_data_dir() -> str:
    """Return the app's internal files directory (set by AndroidPlatform)."""
    try:
        from com.chaquo.python.android import AndroidPlatform
        context = AndroidPlatform.getContext()
        return str(context.getFilesDir())
    except Exception:
        # Fallback for non-Android environments (desktop testing)
        path = os.path.join(os.path.dirname(__file__), "..", "data")
        os.makedirs(path, exist_ok=True)
        return path
