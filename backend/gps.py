"""Laptop GPS — browser Geolocation and/or local gpsd."""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .geo import valid_map_coords

router = APIRouter(prefix="/api/gps", tags=["gps"])

_STATE_PATH = Path(__file__).resolve().parent.parent / "data" / "operator_gps.json"
_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)


class GpsFixIn(BaseModel):
    lat: float
    lng: float | None = None
    lon: float | None = None
    alt: float = 0
    accuracy: float | None = None
    source: str = "browser"
    ts: float | None = None

    def longitude(self) -> float:
        if self.lon is not None:
            return self.lon
        if self.lng is not None:
            return self.lng
        raise ValueError("lng/lon required")


def _read_state() -> dict[str, Any] | None:
    if not _STATE_PATH.exists():
        return None
    try:
        return json.loads(_STATE_PATH.read_text())
    except Exception:
        return None


def _write_state(fix: dict[str, Any]) -> None:
    _STATE_PATH.write_text(json.dumps(fix, indent=2))


def _from_gpsd(timeout_s: float = 0.8) -> dict[str, Any] | None:
    """One TPV sample from gpsd via gpspipe (if running). Fast timeout — never block UI."""
    try:
        proc = subprocess.run(
            ["gpspipe", "-w", "-n", "3"],
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except FileNotFoundError:
        return None
    except subprocess.TimeoutExpired:
        return None
    except Exception:
        return None

    best = None
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("class") != "TPV":
            continue
        lat, lon = obj.get("lat"), obj.get("lon")
        if lat is None or lon is None:
            continue
        if not valid_map_coords(float(lat), float(lon)):
            continue
        mode = int(obj.get("mode") or 0)
        if mode < 2:
            continue
        best = {
            "lat": float(lat),
            "lng": float(lon),
            "lon": float(lon),
            "alt": float(obj.get("alt") or obj.get("altHAE") or 0),
            "accuracy": float(obj.get("eph") or obj.get("epx") or 0) or None,
            "source": "gpsd",
            "ts": time.time(),
            "mode": mode,
            "valid": True,
        }
    return best


@router.get("")
def get_gps(fresh: bool = False) -> dict[str, Any]:
    """Return stored fix immediately; optional ?fresh=1 tries gpsd without blocking long."""
    now = time.time()
    stored = _read_state()
    if stored and valid_map_coords(stored.get("lat"), stored.get("lng")):
        age = now - float(stored.get("ts") or 0)
        if age < 45:
            return {**stored, "valid": True, "age_s": age, "stale": False}

    if fresh:
        gpsd = _from_gpsd()
        if gpsd:
            _write_state(gpsd)
            return {**gpsd, "age_s": 0, "stale": False}

    if stored and valid_map_coords(stored.get("lat"), stored.get("lng")):
        return {
            **stored,
            "valid": True,
            "age_s": now - float(stored.get("ts") or 0),
            "stale": True,
        }

    gpsd = _from_gpsd()
    if gpsd:
        _write_state(gpsd)
        return {**gpsd, "age_s": 0, "stale": False}

    return {
        "valid": False,
        "hint": "Allow browser location or start gpsd (gpspipe -w).",
    }


@router.post("")
def post_gps(body: GpsFixIn) -> dict[str, Any]:
    try:
        lon = body.longitude()
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not valid_map_coords(body.lat, lon):
        raise HTTPException(400, "invalid coords (null-island / out of range)")
    fix = {
        "lat": body.lat,
        "lng": lon,
        "lon": lon,
        "alt": body.alt,
        "accuracy": body.accuracy,
        "source": body.source or "browser",
        "ts": body.ts or time.time(),
        "valid": True,
    }
    _write_state(fix)
    return fix
