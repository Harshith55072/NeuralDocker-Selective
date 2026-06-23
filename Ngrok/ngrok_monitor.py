"""
ngrok URL Monitor Service
=========================
Automatically detects a running ngrok instance, extracts the public tunnel URL,
writes it to a file, and keeps the file updated whenever the URL changes.

Usage:
    python ngrok_monitor.py [--output ngrok_url.txt] [--interval 30] [--format env]
"""

import argparse
import json
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
DEFAULT_NGROK_API = os.getenv("NGROK_API_URL", "http://127.0.0.1:4040/api/tunnels")
DEFAULT_OUTPUT_FILE = "ngrok_url.txt"
DEFAULT_INTERVAL = 30          # seconds between polls
DEFAULT_FORMAT = "plain"       # "plain" | "env" | "json"

# Common ngrok binary locations to search when it isn't on PATH
NGROK_SEARCH_PATHS = [
    "/usr/local/bin/ngrok",
    "/usr/bin/ngrok",
    os.path.expanduser("~/bin/ngrok"),
    os.path.expanduser("~/.local/bin/ngrok"),
    # Windows
    r"C:\Program Files\ngrok\ngrok.exe",
    r"C:\Users\%USERNAME%\AppData\Local\ngrok\ngrok.exe",
    # Snap / Homebrew
    "/snap/bin/ngrok",
    "/opt/homebrew/bin/ngrok",
]

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("ngrok-monitor")


# ---------------------------------------------------------------------------
# Helper: find ngrok binary on the system
# ---------------------------------------------------------------------------
def find_ngrok_binary() -> str | None:
    """Return the path to the ngrok executable, or None if not found."""
    # 1. Check PATH first (fastest)
    try:
        result = subprocess.run(
            ["which", "ngrok"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            path = result.stdout.strip()
            if path:
                log.info("Found ngrok on PATH: %s", path)
                return path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Windows equivalent
    try:
        result = subprocess.run(
            ["where", "ngrok"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            path = result.stdout.splitlines()[0].strip()
            if path:
                log.info("Found ngrok via 'where': %s", path)
                return path
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # 2. Scan known locations
    for candidate in NGROK_SEARCH_PATHS:
        expanded = os.path.expandvars(candidate)
        if os.path.isfile(expanded) and os.access(expanded, os.X_OK):
            log.info("Found ngrok at: %s", expanded)
            return expanded

    return None


# ---------------------------------------------------------------------------
# Helper: check whether ngrok is currently running
# ---------------------------------------------------------------------------
def is_ngrok_running(api_url: str = DEFAULT_NGROK_API) -> bool:
    """Return True if the ngrok local API is reachable."""
    try:
        resp = requests.get(api_url, timeout=3)
        return resp.status_code == 200
    except requests.exceptions.ConnectionError:
        return False
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Helper: fetch the current public tunnel URL(s) from ngrok
# ---------------------------------------------------------------------------
def get_tunnel_urls(api_url: str = DEFAULT_NGROK_API) -> list[dict]:
    """
    Returns a list of tunnel dicts, each containing:
      { "name": str, "public_url": str, "proto": str, "local_addr": str }
    Raises requests.RequestException on failure.
    """
    resp = requests.get(api_url, timeout=5)
    resp.raise_for_status()
    data = resp.json()

    tunnels = []
    for t in data.get("tunnels", []):
        tunnels.append({
            "name":       t.get("name", ""),
            "public_url": t.get("public_url", ""),
            "proto":      t.get("proto", ""),
            "local_addr": t.get("config", {}).get("addr", ""),
        })
    return tunnels


# ---------------------------------------------------------------------------
# Helper: write the URL(s) to the output file
# ---------------------------------------------------------------------------
def write_output(tunnels: list[dict], output_path: Path, fmt: str) -> None:
    """Write tunnel info to *output_path* in the requested format."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if fmt == "json":
        content = json.dumps(
            {"updated_at": datetime.utcnow().isoformat() + "Z", "tunnels": tunnels},
            indent=2,
        )

    elif fmt == "env":
        lines = [f"# Updated: {datetime.utcnow().isoformat()}Z"]
        for i, t in enumerate(tunnels):
            suffix = f"_{i}" if i > 0 else ""
            lines.append(f'NGROK_URL{suffix}="{t["public_url"]}"')
            lines.append(f'NGROK_PROTO{suffix}="{t["proto"]}"')
        content = "\n".join(lines) + "\n"

    else:  # plain (default)
        lines = [f"# ngrok tunnel URLs — updated {datetime.utcnow().isoformat()}Z"]
        for t in tunnels:
            lines.append(
                f'{t["public_url"]}  '
                f'(proto={t["proto"]}, local={t["local_addr"]}, name={t["name"]})'
            )
        content = "\n".join(lines) + "\n"

    output_path.write_text(content, encoding="utf-8")
    log.info("Output written to: %s", output_path.resolve())


# ---------------------------------------------------------------------------
# Helper: push tunnel URL to backend
# ---------------------------------------------------------------------------
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8081") 
# Service token — must match service.token in application.properties 
# Set via environment variable, never hardcode in production 
SERVICE_TOKEN = os.getenv("SERVICE_TOKEN", "nd-service-token-change-me-in-production") 
 
def _push_tunnel_to_backend(tunnels: list) -> bool:
    endpoint = f"{BACKEND_URL}/api/v1/clusters/register-tunnel"
    headers = {
        "Content-Type": "application/json",
        "X-Service-Token": SERVICE_TOKEN,
    }
    # Identify tunnels by their local address port
    ai_url = next((t["public_url"] for t in tunnels if "8000" in t.get("local_addr", "")), None)
    backend_url = next((t["public_url"] for t in tunnels if "8080" in t.get("local_addr", "") or "8081" in t.get("local_addr", "")), None)

    if not ai_url and not backend_url:
        log.warning("Could not identify ai-service or backend tunnel from: %s", tunnels)
        return False

    payload = {
        "tunnelUrl": ai_url or "",
        "backendTunnelUrl": backend_url or ""
    }
    log.info("Registering tunnels — ai: %s | backend: %s", ai_url, backend_url)

    try:
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=5)
        if resp.status_code == 200:
            log.info("Successfully registered tunnel URLs with backend")
            return True
        elif resp.status_code == 401:
            log.error("Service token rejected by backend.")
            return False
        else:
            log.warning("Backend returned %d: %s", resp.status_code, resp.text)
            return False
    except requests.exceptions.ConnectionError:
        log.warning("Could not reach backend at %s — will retry next poll.", BACKEND_URL)
        return False
    except Exception as exc:
        log.error("Unexpected error pushing tunnel URLs: %s", exc)
        return False 


# ---------------------------------------------------------------------------
# Core monitor loop
# ---------------------------------------------------------------------------
def monitor(
    output_path: Path,
    interval: int,
    fmt: str,
    api_url: str = DEFAULT_NGROK_API,
) -> None:
    """Poll ngrok and keep the output file up-to-date."""

    log.info("=== ngrok URL Monitor started ===")
    log.info("Output file : %s", output_path.resolve())
    log.info("Poll interval: %ds", interval)
    log.info("Output format: %s", fmt)

    # Check if ngrok is installed (just informational)
    binary = find_ngrok_binary()
    if binary:
        log.info("ngrok binary found: %s", binary)
    else:
        log.warning(
            "ngrok binary not found on this system. "
            "The monitor will still work if ngrok is already running."
        )

    last_urls: list[str] = []
    last_push_success: bool = False

    while True:
        try:
            if not is_ngrok_running(api_url):
                log.warning(
                    "ngrok local API not reachable at %s — "
                    "is ngrok running? Retrying in %ds…",
                    api_url, interval,
                )
            else:
                tunnels = get_tunnel_urls(api_url)

                if not tunnels:
                    log.warning("ngrok is running but reported no active tunnels.")
                else:
                    current_urls = [t["public_url"] for t in tunnels]

                    if current_urls != last_urls:
                        log.info(
                            "Tunnel URL(s) changed! New: %s",
                            ", ".join(current_urls),
                        )
                        write_output(tunnels, output_path, fmt)
                        last_urls = current_urls

                    # Always attempt push — backend may have restarted or DB was cleared
                    _push_tunnel_to_backend(tunnels)
                    log.debug("Tunnel URL(s): %s", ", ".join(current_urls))

        except requests.RequestException as exc:
            log.error("Error contacting ngrok API: %s", exc)
        except Exception as exc:
            log.exception("Unexpected error: %s", exc)

        time.sleep(interval)


# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
def _handle_signal(signum, frame):  # noqa: ANN001
    log.info("Received signal %s — shutting down.", signum)
    sys.exit(0)


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Monitor ngrok and keep a URL file up-to-date.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--output", "-o",
        default=DEFAULT_OUTPUT_FILE,
        help="Path to the output file that stores the ngrok URL.",
    )
    parser.add_argument(
        "--interval", "-i",
        type=int,
        default=DEFAULT_INTERVAL,
        help="Poll interval in seconds.",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["plain", "env", "json"],
        default=DEFAULT_FORMAT,
        help=(
            "Output format: "
            "'plain' = human-readable text, "
            "'env' = KEY=VALUE (sourceable), "
            "'json' = machine-readable JSON."
        ),
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_NGROK_API,
        help="ngrok local API URL (change port if you customised ngrok).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Fetch once, write output, then exit (no polling loop).",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable DEBUG logging.",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    output_path = Path(args.output)

    if args.once:
        # Single-shot mode
        binary = find_ngrok_binary()
        if binary:
            log.info("ngrok binary: %s", binary)

        if not is_ngrok_running(args.api_url):
            log.error("ngrok is not running (API not reachable at %s).", args.api_url)
            sys.exit(1)

        tunnels = get_tunnel_urls(args.api_url)
        if not tunnels:
            log.error("No active tunnels found.")
            sys.exit(1)

        write_output(tunnels, output_path, args.format)
        for t in tunnels:
            print(t["public_url"])
        sys.exit(0)

    monitor(output_path, args.interval, args.format, args.api_url)


if __name__ == "__main__":
    main()
