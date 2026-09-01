"""In-process Finch Seed Engine bridge — no second HTTP server required."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

FINCH_ROOT = Path(os.environ.get("FINCH_ROOT", "/home/Hatari/repos/PT/finch")).resolve()
FINCH_PYTHON = Path(os.environ.get("FINCH_PYTHON", FINCH_ROOT / "venv/bin/python"))


def finch_available() -> bool:
    return FINCH_ROOT.is_dir() and (FINCH_ROOT / "backend" / "seed_engine.py").is_file()


def _finch_python() -> str:
    if FINCH_PYTHON.is_file():
        return str(FINCH_PYTHON)
    return sys.executable


async def fetch_seed_package(query: str, *, refresh: bool = False) -> tuple[dict[str, Any] | None, str | None]:
    """Run Finch process_seed in Finch's venv; returns (package, error)."""
    q = (query or "").strip()
    if not q:
        return None, "empty query"
    if not finch_available():
        return None, f"Finch not found at {FINCH_ROOT}"

    code = f"""
import asyncio, json, sys
sys.path.insert(0, {str(FINCH_ROOT)!r})
from backend.seed_engine import process_seed

async def main():
    pkg = await process_seed(
        {json.dumps(q)},
        use_cache={not refresh},
        verbose=True,
    )
    print(json.dumps(pkg, default=str))

asyncio.run(main())
"""

    try:
        proc = await asyncio.create_subprocess_exec(
            _finch_python(),
            "-c",
            code,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(FINCH_ROOT),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180.0)
    except asyncio.TimeoutError:
        return None, "Finch seed timed out (>180s)"
    except Exception as e:
        return None, f"Finch seed failed: {e}"

    if proc.returncode != 0:
        err = (stderr or b"").decode("utf-8", errors="replace").strip()
        return None, err[:400] or f"Finch exited {proc.returncode}"

    raw = (stdout or b"").decode("utf-8", errors="replace").strip()
    if not raw:
        return None, "Finch returned empty response"

    try:
        return json.loads(raw), None
    except json.JSONDecodeError as e:
        return None, f"Finch JSON parse error: {e}"


async def ping() -> dict[str, Any]:
    ok = finch_available()
    py = _finch_python()
    return {
        "available": ok,
        "root": str(FINCH_ROOT),
        "python": py,
        "mode": "embedded",
    }
