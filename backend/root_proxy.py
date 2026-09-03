"""Optional proxy to a live Root kit (http://192.168.4.1) for radar feed."""
from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/root", tags=["root"])


@router.get("/devices")
async def root_devices(
    base: str = Query("http://192.168.4.1", description="Root kit base URL"),
) -> dict[str, Any]:
    base = (base or "").rstrip("/") + "/"
    url = urljoin(base, "api/devices")
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(url)
    except Exception as e:
        raise HTTPException(502, f"Root kit unreachable at {url}: {e}") from e
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Root kit error: {r.text[:200]}")
    try:
        return r.json()
    except Exception as e:
        raise HTTPException(502, f"invalid JSON from Root: {e}") from e


@router.get("/ping")
async def root_ping(
    base: str = Query("http://192.168.4.1"),
) -> dict[str, Any]:
    base = (base or "").rstrip("/") + "/"
    url = urljoin(base, "api/ping")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(url)
        return {"ok": r.status_code == 200, "status": r.status_code, "base": base.rstrip("/")}
    except Exception as e:
        return {"ok": False, "error": str(e), "base": base.rstrip("/")}


class GpsPush(BaseModel):
    lat: float
    lng: float | None = None
    lon: float | None = None
    alt: float = 0
    accuracy: float | None = None


@router.post("/gps")
async def root_push_gps(
    body: GpsPush,
    base: str = Query("http://192.168.4.1"),
) -> dict[str, Any]:
    """Forward laptop fix to Root POST /api/gps."""
    lon = body.lon if body.lon is not None else body.lng
    if lon is None:
        raise HTTPException(400, "lng/lon required")
    base = (base or "").rstrip("/") + "/"
    url = urljoin(base, "api/gps")
    payload = {
        "lat": body.lat,
        "lon": lon,
        "lng": lon,
        "alt": body.alt,
        "accuracy": body.accuracy,
    }
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.post(url, json=payload)
    except Exception as e:
        raise HTTPException(502, f"Root GPS push failed: {e}") from e
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text[:300])
    try:
        return r.json()
    except Exception:
        return {"ok": True, "raw": r.text[:200]}


@router.get("/gps")
async def root_get_gps(
    base: str = Query("http://192.168.4.1"),
) -> dict[str, Any]:
    base = (base or "").rstrip("/") + "/"
    url = urljoin(base, "api/gps")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(url)
    except Exception as e:
        return {"valid": False, "error": str(e)}
    if r.status_code != 200:
        return {"valid": False, "status": r.status_code}
    try:
        return r.json()
    except Exception:
        return {"valid": False, "error": "bad json"}


class OmniCmd(BaseModel):
    cmd: str = "./omni status"
    base: str = "http://192.168.4.1"


@router.post("/omni")
async def root_omni(body: OmniCmd) -> dict[str, Any]:
    """Forward OmniScan ./omni command to root kit POST /api/omni."""
    base = (body.base or "http://192.168.4.1").rstrip("/") + "/"
    url = urljoin(base, "api/omni")
    cmd = (body.cmd or "./omni status").strip()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(url, json={"cmd": cmd})
    except Exception as e:
        raise HTTPException(502, f"Root OmniScan unreachable at {url}: {e}") from e
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text[:400])
    try:
        data = r.json()
    except Exception:
        return {"ok": True, "status": "OK", "output": r.text[:12000], "raw": True}
    if "output" not in data and "ok" not in data:
        data = {"ok": True, "status": "OK", "output": str(data)}
    # Ensure output is always a displayable string for the Omni terminal
    out = data.get("output")
    if out is None:
        data["output"] = ""
    elif not isinstance(out, str):
        data["output"] = str(out)
    return data


@router.get("/subghz/raw")
async def root_subghz_raw(
    n: int = Query(20, ge=1, le=50),
    base: str = Query("http://192.168.4.1"),
) -> dict[str, Any]:
    """Proxy GET /api/subghz/raw — structured HEX packets for Omni tab."""
    base = (base or "").rstrip("/") + "/"
    url = urljoin(base, f"api/subghz/raw?n={n}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
    except Exception as e:
        raise HTTPException(502, f"Root Sub-GHz raw unreachable: {e}") from e
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text[:400])
    try:
        return r.json()
    except Exception:
        return {"ok": False, "error": "bad json", "text": r.text[:500]}


@router.get("/omni")
async def root_omni_get(
    cmd: str = Query("./omni status"),
    base: str = Query("http://192.168.4.1"),
) -> dict[str, Any]:
    return await root_omni(OmniCmd(cmd=cmd, base=base))
