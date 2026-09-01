"""FaceSearch AI — Visage reverse face search + local detect/match."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from . import face_bridge, store

router = APIRouter(prefix="/api/facesearch", tags=["facesearch"])


@router.get("/health")
async def facesearch_health() -> dict[str, Any]:
    h = await face_bridge.health()
    if h.get("mode") == "http":
        ok = "face" in h and not h.get("error")
    else:
        ok = bool(h.get("available")) and "face" in h and not h.get("error")
    return {"ok": ok, **h}


@router.get("/consent")
async def facesearch_consent() -> dict[str, Any]:
    return await face_bridge.consent()


@router.get("/progress")
async def facesearch_progress() -> dict[str, Any]:
    return await face_bridge.progress()


@router.post("/detect")
async def facesearch_detect(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty upload")
    try:
        return await face_bridge.detect(data)
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/match")
async def facesearch_match(
    file: UploadFile = File(...),
    threshold: float | None = Form(None),
    top_k: int = Form(5),
) -> dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty upload")
    try:
        return await face_bridge.match(data, threshold=threshold, top_k=top_k)
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/avatar")
async def facesearch_avatar(
    handle: str = Query(..., min_length=1),
    platform: str = Query(""),
) -> dict[str, Any]:
    plat, h = face_bridge.parse_handle_query(handle)
    if not plat and platform.strip():
        plat = platform.strip().lower()
    if not h:
        h = handle.strip().lstrip("@")
    try:
        data = await face_bridge.resolve_social_avatar(h, plat)
        return {"ok": True, "handle": h, "platform": plat or None, **data}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e


@router.post("/reverse")
async def facesearch_reverse(
    file: UploadFile | None = File(None),
    handle: str = Form(""),
    platform: str = Form(""),
    person_name: str = Form(""),
    aliases: str = Form(""),
    consent: str = Form("false"),
    threshold: float = Form(0.6),
    max_per_engine: int = Form(30),
    engagement_id: str = Form(""),
) -> dict[str, Any]:
    data = await file.read() if file else b""
    raw_handle = (handle or "").strip()
    raw_name = (person_name or "").strip()
    plat, h = face_bridge.parse_handle_query(raw_handle)
    if platform.strip():
        plat = platform.strip().lower()
    if not h and raw_handle and " " in raw_handle and not raw_handle.startswith("@"):
        raw_name = raw_name or raw_handle
    if not data and not h and not raw_name:
        raise HTTPException(
            400,
            "upload a photo, enter @handle, or enter a subject name for public image search",
        )
    consented = (consent or "").strip().lower() in ("1", "true", "yes", "on")
    extra = [a.strip().lstrip("@") for a in (aliases or "").split(",") if a.strip()]
    label = raw_name or h or "photo-seed"
    try:
        result = await face_bridge.public_sweep(
            data or None,
            handle=h,
            platform=plat,
            person_name=label,
            aliases=extra,
            consent=consented,
            threshold=threshold,
            max_per_engine=max_per_engine,
        )
    except PermissionError as e:
        raise HTTPException(403, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    if result.get("error"):
        raise HTTPException(503, result["error"])

    eid = (engagement_id or "").strip()
    if eid:
        eng = store.get_engagement(eid)
        if eng:
            label = (person_name or "").strip() or h or "FaceSearch"
            src = result.get("probe_source") or "upload"
            store.append_action(eid, "facesearch", f"{src}: {label}")
            for f in result.get("findings") or []:
                if isinstance(f, dict):
                    store.add_finding(
                        eid,
                        {
                            "source": f.get("source") or "facesearch",
                            "summary": f.get("value") or f.get("summary") or "face match",
                            "meta": f,
                        },
                    )
            matches = result.get("matches") or []
            store.add_finding(
                eid,
                {
                    "source": "facesearch",
                    "summary": f"{len(matches)} graded reverse match(es) for {label}",
                    "meta": {"matches": matches[:20], "engines": result.get("engines")},
                },
            )

    return {"ok": True, "result": result}
