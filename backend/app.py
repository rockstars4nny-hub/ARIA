"""
ARIA — Advanced Recon Intelligence Agent
  python -m backend serve   # → http://127.0.0.1:8877
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import collectors, store
from .face_bridge import health as face_health
from .face_router import router as face_router
from .finch_bridge import ping as finch_ping
from .geo import valid_map_coords
from .gps import router as gps_router
from .root_proxy import router as root_router

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
PAGES = FRONTEND_DIR / "pages"

app = FastAPI(
    title="ARIA",
    description="Advanced Recon Intelligence Agent",
    version="0.5.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(root_router)
app.include_router(gps_router)
app.include_router(face_router)


class Locus(BaseModel):
    lat: float
    lng: float
    label: str = ""
    gps: bool = True


class EngagementCreate(BaseModel):
    title: str = "Untitled engagement"
    roe: str = ""
    operator: str = "operator"
    declared_locus: Locus


class SkillRun(BaseModel):
    engagement_id: str
    skill: str
    query: str = Field(..., min_length=1)


def _page(name: str) -> FileResponse:
    path = PAGES / name
    if not path.exists():
        raise HTTPException(404, f"page missing: {name}")
    return FileResponse(path)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    finch = await finch_ping()
    face = await face_health()
    return {
        "ok": True,
        "product": "ARIA",
        "full_name": "Advanced Recon Intelligence Agent",
        "version": "0.5.0",
        "map": "maplibre+openfreemap",
        "gps": "browser+gpsd",
        "finch_seed": finch,
        "facesearch": face,
        "url": "http://127.0.0.1:8877",
        "not": "Finch",
    }


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    engs = store.list_engagements()
    return {
        "engagements": engs,
        "stats": {
            "total": len(engs),
            "pins": sum(len(e.get("pins") or []) for e in engs),
            "findings": sum(len(e.get("findings") or []) for e in engs),
            "actions": sum(len(e.get("actions") or []) for e in engs),
        },
    }


@app.get("/api/engagements")
def list_engagements() -> list[dict[str, Any]]:
    return store.list_engagements()


@app.post("/api/engagements")
def create_engagement(body: EngagementCreate) -> dict[str, Any]:
    if not valid_map_coords(body.declared_locus.lat, body.declared_locus.lng):
        raise HTTPException(400, "declared_locus failed geo honesty check")
    return store.create_engagement(
        title=body.title,
        declared_locus=body.declared_locus.model_dump(),
        roe=body.roe,
        operator=body.operator,
    )


@app.get("/api/engagements/{eid}")
def get_engagement(eid: str) -> dict[str, Any]:
    eng = store.get_engagement(eid)
    if not eng:
        raise HTTPException(404, "engagement not found")
    return eng


class LocusUpdate(BaseModel):
    lat: float
    lng: float
    label: str = "Laptop GPS"
    gps: bool = True


@app.patch("/api/engagements/{eid}/locus")
def patch_engagement_locus(eid: str, body: LocusUpdate) -> dict[str, Any]:
    if not valid_map_coords(body.lat, body.lng):
        raise HTTPException(400, "locus failed geo honesty check")
    eng = store.update_declared_locus(eid, body.model_dump())
    if not eng:
        raise HTTPException(404, "engagement not found")
    return eng


@app.get("/api/engagements/{eid}/export")
def export_engagement(eid: str) -> dict[str, Any]:
    pack = store.export_audit(eid)
    if not pack:
        raise HTTPException(404, "engagement not found")
    return pack


@app.delete("/api/engagements/{eid}")
def delete_engagement(eid: str) -> dict[str, Any]:
    if not store.delete_engagement(eid):
        raise HTTPException(404, "engagement not found")
    return {"ok": True, "deleted": eid}


@app.delete("/api/engagements/{eid}/audit")
def clear_engagement_audit(eid: str) -> dict[str, Any]:
    eng = store.clear_audit(eid)
    if not eng:
        raise HTTPException(404, "engagement not found")
    return {"ok": True, "engagement": eng}


@app.post("/api/skills/run")
async def run_skill(body: SkillRun) -> dict[str, Any]:
    eng = store.get_engagement(body.engagement_id)
    if not eng:
        raise HTTPException(404, "engagement not found")
    runner = collectors.RUNNERS.get(body.skill)
    if not runner:
        raise HTTPException(400, f"unknown skill: {body.skill}")
    store.append_action(body.engagement_id, "skill_run", f"{body.skill}: {body.query}")
    result = await runner(body.query, eng)
    for pin in result.get("pins") or []:
        store.add_pin(body.engagement_id, pin)
    for finding in result.get("findings") or []:
        store.add_finding(body.engagement_id, finding)
    return {"ok": True, "result": result, "engagement": store.get_engagement(body.engagement_id)}


# —— Unified kit dashboard (primary) ——
@app.get("/")
def page_kit() -> FileResponse:
    return _page("kit.html")


@app.get("/kit")
def page_kit_alias() -> FileResponse:
    return _page("kit.html")


# Legacy routes → kit tabs (same tools, one dashboard)
@app.get("/globe")
def page_globe() -> RedirectResponse:
    return RedirectResponse("/#engagements", status_code=302)


@app.get("/radar")
def page_radar() -> RedirectResponse:
    return RedirectResponse("/#radar", status_code=302)


@app.get("/engagements")
def page_engagements() -> RedirectResponse:
    return RedirectResponse("/#engagements", status_code=302)


@app.get("/domains/seed")
def page_seed() -> RedirectResponse:
    return RedirectResponse("/#run-seed", status_code=302)


@app.get("/domains/osint")
def page_osint() -> RedirectResponse:
    return RedirectResponse("/#run-osint", status_code=302)


@app.get("/domains/glass")
def page_glass() -> RedirectResponse:
    return RedirectResponse("/#run-glass", status_code=302)


@app.get("/domains/web3")
def page_web3() -> RedirectResponse:
    return RedirectResponse("/#run-web3", status_code=302)


@app.get("/domains/rf")
def page_rf() -> RedirectResponse:
    return RedirectResponse("/#run-rf", status_code=302)


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


def main() -> None:
    import argparse
    import uvicorn

    p = argparse.ArgumentParser(description="ARIA Kit — integrated protocol")
    p.add_argument("--host", default=os.environ.get("ARIA_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.environ.get("ARIA_PORT", "8877")))
    args, _ = p.parse_known_args()
    uvicorn.run("backend.app:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
