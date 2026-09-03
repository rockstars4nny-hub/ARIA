"""Local engagement persistence (JSON files under data/engagements)."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "engagements"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _path(eid: str) -> Path:
    safe = "".join(c for c in eid if c.isalnum() or c in "-_")
    return DATA_DIR / f"{safe}.json"


def list_engagements() -> list[dict[str, Any]]:
    out = []
    for p in sorted(DATA_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            out.append(json.loads(p.read_text()))
        except Exception:
            continue
    return out


def get_engagement(eid: str) -> dict[str, Any] | None:
    p = _path(eid)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def save_engagement(eng: dict[str, Any]) -> dict[str, Any]:
    eng["updated_at"] = _now()
    _path(eng["id"]).write_text(json.dumps(eng, indent=2))
    return eng


def create_engagement(
    title: str,
    declared_locus: dict[str, Any],
    roe: str = "",
    operator: str = "operator",
) -> dict[str, Any]:
    eng = {
        "id": f"eng-{uuid.uuid4().hex[:12]}",
        "title": title or "Untitled engagement",
        "roe": roe,
        "operator": operator,
        "declared_locus": declared_locus,
        "observed_loci": [],
        "pins": [],
        "actions": [
            {
                "ts": _now(),
                "kind": "engagement_created",
                "detail": title or "Untitled engagement",
            }
        ],
        "findings": [],
        "omni_log": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    return save_engagement(eng)


def update_declared_locus(eid: str, locus: dict[str, Any]) -> dict[str, Any] | None:
    eng = get_engagement(eid)
    if not eng:
        return None
    eng["declared_locus"] = dict(locus)
    eng["actions"].append(
        {
            "ts": _now(),
            "kind": "locus_updated",
            "detail": f"{locus.get('label', 'locus')}: {locus.get('lat')}, {locus.get('lng')}",
        }
    )
    return save_engagement(eng)


def append_action(eid: str, kind: str, detail: str) -> dict[str, Any] | None:
    eng = get_engagement(eid)
    if not eng:
        return None
    eng["actions"].append({"ts": _now(), "kind": kind, "detail": detail})
    return save_engagement(eng)


def add_pin(eid: str, pin: dict[str, Any]) -> dict[str, Any] | None:
    eng = get_engagement(eid)
    if not eng:
        return None
    pin = dict(pin)
    pin.setdefault("id", f"pin-{uuid.uuid4().hex[:10]}")
    pin.setdefault("ts", _now())
    eng["pins"].append(pin)
    if pin.get("gps") and pin.get("lat") is not None:
        eng["observed_loci"].append(
            {
                "lat": pin["lat"],
                "lng": pin["lng"],
                "label": pin.get("label"),
                "source": pin.get("source"),
                "ts": pin["ts"],
            }
        )
    eng["actions"].append(
        {
            "ts": _now(),
            "kind": "pin_added",
            "detail": f"{pin.get('source')}: {pin.get('label')}",
        }
    )
    return save_engagement(eng)


def add_finding(eid: str, finding: dict[str, Any]) -> dict[str, Any] | None:
    eng = get_engagement(eid)
    if not eng:
        return None
    finding = dict(finding)
    finding.setdefault("id", f"f-{uuid.uuid4().hex[:8]}")
    finding.setdefault("ts", _now())
    eng["findings"].append(finding)
    eng["actions"].append(
        {
            "ts": _now(),
            "kind": "finding",
            "detail": finding.get("summary", finding.get("id")),
        }
    )
    return save_engagement(eng)


def append_omni_log(
    eid: str,
    entries: list[dict[str, Any]],
    *,
    replace: bool = False,
) -> dict[str, Any] | None:
    """Append (or replace) OmniScan console lines on the engagement."""
    eng = get_engagement(eid)
    if not eng:
        return None
    if "omni_log" not in eng or not isinstance(eng.get("omni_log"), list):
        eng["omni_log"] = []
    cleaned: list[dict[str, Any]] = []
    for e in entries or []:
        if not isinstance(e, dict):
            continue
        text = str(e.get("text") or e.get("line") or "").rstrip("\n")
        if not text and e.get("cls") != "omni-meta":
            continue
        cleaned.append(
            {
                "ts": e.get("ts") or _now(),
                "cls": e.get("cls") or "omni-out",
                "text": text,
            }
        )
    if replace:
        eng["omni_log"] = cleaned
    else:
        eng["omni_log"].extend(cleaned)
        # Cap growth — keep last 2000 lines
        if len(eng["omni_log"]) > 2000:
            eng["omni_log"] = eng["omni_log"][-2000:]
    eng["actions"].append(
        {
            "ts": _now(),
            "kind": "omni_log",
            "detail": f"{'replaced' if replace else 'appended'} {len(cleaned)} Omni line(s) "
            f"(total {len(eng['omni_log'])})",
        }
    )
    return save_engagement(eng)


def export_audit(eid: str) -> dict[str, Any] | None:
    eng = get_engagement(eid)
    if not eng:
        return None
    omni = eng.get("omni_log") or []
    omni_text = "\n".join(str(x.get("text") or "") for x in omni if isinstance(x, dict))
    return {
        "product": "ARIA — Advanced Recon Intelligence Agent",
        "export_type": "engagement_audit",
        "exported_at": _now(),
        "engagement": eng,
        "omni_log": omni,
        "omni_output": omni_text,
        "proof": {
            "declared_locus": eng.get("declared_locus"),
            "observed_loci": eng.get("observed_loci"),
            "pin_count": len(eng.get("pins") or []),
            "action_count": len(eng.get("actions") or []),
            "omni_line_count": len(omni),
        },
    }


def delete_engagement(eid: str) -> bool:
    p = _path(eid)
    if not p.exists():
        return False
    p.unlink()
    return True


def clear_audit(eid: str) -> dict[str, Any] | None:
    """Remove pins, findings, observed loci, and action log — keep engagement shell."""
    eng = get_engagement(eid)
    if not eng:
        return None
    eng["pins"] = []
    eng["findings"] = []
    eng["observed_loci"] = []
    eng["omni_log"] = []
    eng["actions"] = [
        {
            "ts": _now(),
            "kind": "audit_cleared",
            "detail": "Pins, findings, Omni log, and action log cleared",
        }
    ]
    return save_engagement(eng)
