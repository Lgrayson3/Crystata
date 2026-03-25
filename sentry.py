"""
Phase 1: Performance Guard (Sentry Module)
Identifies and purges non-essential background processes to optimize machine performance.
"""

import psutil
import os
import sys
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SENTRY] %(message)s")
log = logging.getLogger("sentry")

# Processes known to be non-essential / resource-hungry
NON_ESSENTIAL_KEYWORDS = [
    "spotify", "discord", "slack", "teams", "zoom",
    "chrome", "firefox", "brave", "safari", "opera",
    "dropbox", "onedrive", "googledrive", "google drive",
    "steam", "epic", "origin", "battle.net",
    "adobe", "creative cloud",
    "skype", "telegram", "signal",
    "obs", "streamlabs",
    "torrent", "qbittorrent", "utorrent",
    "vlc", "mpv", "iina",
    "notion", "obsidian",
]

# Processes that must never be touched
PROTECTED_KEYWORDS = [
    "python", "streamlit", "code", "cursor",
    "terminal", "bash", "zsh", "fish", "sh",
    "systemd", "launchd", "kernel", "init",
    "sshd", "cron", "dbus", "wpa", "network",
    "postgres", "mysql", "sqlite",
    "security", "antivirus", "firewall",
]


def _is_protected(proc_name: str) -> bool:
    name_lower = proc_name.lower()
    return any(kw in name_lower for kw in PROTECTED_KEYWORDS)


def _is_non_essential(proc_name: str) -> bool:
    name_lower = proc_name.lower()
    return any(kw in name_lower for kw in NON_ESSENTIAL_KEYWORDS)


def scan_processes() -> dict:
    """Scan all running processes and categorize them."""
    results = {
        "non_essential": [],
        "protected": [],
        "system": [],
        "total_scanned": 0,
        "cpu_before": psutil.cpu_percent(interval=1),
        "ram_before": psutil.virtual_memory().percent,
    }

    for proc in psutil.process_iter(["pid", "name", "status", "cpu_percent", "memory_percent"]):
        try:
            info = proc.info
            results["total_scanned"] += 1

            if _is_protected(info["name"]):
                results["protected"].append(info)
            elif _is_non_essential(info["name"]):
                results["non_essential"].append(info)
            else:
                results["system"].append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    return results


def purge_non_essential(dry_run: bool = True) -> dict:
    """
    Terminate non-essential processes.
    dry_run=True (default) only reports what WOULD be killed.
    """
    scan = scan_processes()
    killed = []
    skipped = []

    log.info(f"CPU before scan: {scan['cpu_before']}% | RAM before: {scan['ram_before']}%")
    log.info(f"Found {len(scan['non_essential'])} non-essential processes.")

    for proc_info in scan["non_essential"]:
        pid = proc_info["pid"]
        name = proc_info["name"]

        if dry_run:
            log.info(f"[DRY RUN] Would terminate: {name} (PID {pid})")
            skipped.append(proc_info)
            continue

        try:
            proc = psutil.Process(pid)
            proc.terminate()
            proc.wait(timeout=5)
            log.info(f"Terminated: {name} (PID {pid})")
            killed.append(proc_info)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired) as e:
            log.warning(f"Could not terminate {name} (PID {pid}): {e}")
            skipped.append(proc_info)

    cpu_after = psutil.cpu_percent(interval=1)
    ram_after = psutil.virtual_memory().percent

    return {
        "timestamp": datetime.now().isoformat(),
        "dry_run": dry_run,
        "killed": killed,
        "skipped": skipped,
        "cpu_before": scan["cpu_before"],
        "cpu_after": cpu_after,
        "ram_before": scan["ram_before"],
        "ram_after": ram_after,
        "cpu_delta": round(scan["cpu_before"] - cpu_after, 2),
        "ram_delta": round(scan["ram_before"] - ram_after, 2),
    }


def get_resource_snapshot() -> dict:
    """Return a quick CPU/RAM/disk snapshot for the dashboard."""
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "cpu_percent": psutil.cpu_percent(interval=0.5),
        "ram_percent": mem.percent,
        "ram_used_gb": round(mem.used / 1e9, 2),
        "ram_total_gb": round(mem.total / 1e9, 2),
        "disk_percent": disk.percent,
        "disk_free_gb": round(disk.free / 1e9, 2),
        "process_count": len(list(psutil.process_iter())),
    }


if __name__ == "__main__":
    import json
    dry = "--live" not in sys.argv
    print(json.dumps(purge_non_essential(dry_run=dry), indent=2))
