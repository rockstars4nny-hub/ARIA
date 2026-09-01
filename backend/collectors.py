"""Skill runners — each returns pins/findings for the globe AND a domain report for the page."""
from __future__ import annotations

import os
import re
from typing import Any

import httpx

from .finch_bridge import FINCH_ROOT, fetch_seed_package, finch_available, ping as finch_ping
from .geo import is_non_routable_ip, lan_schematic_coords, valid_map_coords

# Legacy HTTP fallback only if FINCH_HTTP=1 (separate server mode — not default)
FINCH_BASE = os.environ.get("FINCH_BASE", "").rstrip("/")

_IP_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")
_HEX_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^[\d\s\-\+\(\)\.]{10,}$")


def _classify_seed(q: str) -> str:
    q = (q or "").strip()
    if not q:
        return "unknown"
    if _EMAIL_RE.match(q):
        return "email"
    if q.startswith("@"):
        return "handle"
    if _HEX_RE.match(q):
        return "wallet"
    if _IP_RE.match(q.split("/")[0]):
        return "ip"
    if _PHONE_RE.match(q) and len(re.sub(r"\D", "", q)) >= 10:
        return "phone"
    if "." in q and " " not in q and not q.startswith("."):
        return "domain"
    return "name"


def _seed_pivots(q: str, kind: str) -> list[dict[str, str]]:
    pivots: list[dict[str, str]] = []
    if kind == "email":
        local, _, domain = q.partition("@")
        pivots.append({"label": "OSINT domain", "skill": "osint", "query": domain})
        if local:
            pivots.append({"label": "Handle pivot", "skill": "seed", "query": f"@{local}"})
    elif kind == "handle":
        pivots.append({"label": "Normalize handle", "skill": "seed", "query": q.lstrip("@")})
    elif kind == "domain":
        pivots.append({"label": "DNS + infra", "skill": "osint", "query": q})
    elif kind == "ip":
        pivots.append({"label": "Glass fabric", "skill": "glass", "query": q})
    elif kind == "wallet":
        pivots.append({"label": "Chain trace", "skill": "web3", "query": q})
    elif kind == "name":
        pivots.append({"label": "Domain guess", "skill": "osint", "query": f"{q.replace(' ', '').lower()}.com"})
    return pivots


async def geolocate_ip(ip: str) -> dict[str, Any] | None:
    ip = (ip or "").strip()
    if not _IP_RE.match(ip):
        return None
    if is_non_routable_ip(ip):
        coords = lan_schematic_coords(ip)
        if not coords:
            return None
        return {
            "lat": coords[0],
            "lng": coords[1],
            "gps": False,
            "schematic": True,
            "label": f"LAN {ip}",
            "city": None,
            "country": None,
            "org": "private/schematic",
        }
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(f"https://ipapi.co/{ip}/json/")
            if r.status_code != 200:
                r = await client.get(f"https://ipinfo.io/{ip}/json")
            data = r.json()
    except Exception:
        return None

    lat = data.get("latitude") or data.get("lat")
    lng = data.get("longitude") or data.get("lon") or data.get("lng")
    if lat is None and isinstance(data.get("loc"), str) and "," in data["loc"]:
        parts = data["loc"].split(",")
        lat, lng = parts[0], parts[1]
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        return None
    if not valid_map_coords(lat_f, lng_f):
        return None
    return {
        "lat": lat_f,
        "lng": lng_f,
        "gps": True,
        "schematic": False,
        "label": ip,
        "city": data.get("city"),
        "country": data.get("country_name") or data.get("country"),
        "org": data.get("org") or data.get("organization"),
        "asn": data.get("asn"),
        "region": data.get("region"),
    }


async def run_glass(query: str, engagement: dict[str, Any]) -> dict[str, Any]:
    q = (query or "").strip()
    pins: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "domain": "glass",
        "query": q,
        "status": "error",
        "fabric": {},
        "geo": None,
        "exposure": [],
    }

    ip = q.split("/")[0].strip() if "/" in q else q
    is_cidr = "/" in q

    if not _IP_RE.match(ip):
        msg = f"Expected IP or CIDR, got {q!r}"
        findings.append({"summary": f"Glass: {msg}", "claim_level": "observed", "source": "glass"})
        report["error"] = msg
        return {"pins": pins, "findings": findings, "report": report}

    geo = await geolocate_ip(ip)
    if geo:
        schematic = bool(geo.get("schematic"))
        exposure = []
        if schematic:
            exposure = [
                "Private/LAN address — schematic layout only, not measured GPS",
                "Check local fabric: RTSP paths, ONVIF, default creds on segment",
            ]
        else:
            exposure = [
                "Public routable host — verify ownership before active probing",
                "Cross-check Shodan/Censys if authorized",
            ]

        pins.append(
            {
                "source": "glass",
                "kind": "camera_fabric",
                "label": geo["label"],
                "lat": geo["lat"],
                "lng": geo["lng"],
                "gps": geo["gps"],
                "meta": {
                    "query": q,
                    "city": geo.get("city"),
                    "country": geo.get("country"),
                    "org": geo.get("org"),
                    "schematic": schematic,
                },
            }
        )
        findings.append(
            {
                "summary": f"Glass: {q} → {geo.get('city') or 'LAN schematic'}, {geo.get('country') or 'private'}",
                "claim_level": "observed",
                "source": "glass",
            }
        )
        report.update(
            {
                "status": "ok",
                "target": {"ip": ip, "cidr": q if is_cidr else None},
                "geo": geo,
                "fabric": {
                    "schematic": schematic,
                    "org": geo.get("org"),
                    "asn": geo.get("asn"),
                    "region": geo.get("region"),
                },
                "exposure": exposure,
            }
        )
    else:
        msg = f"No valid map coords for {q} (null-island filtered)"
        findings.append({"summary": f"Glass: {msg}", "claim_level": "observed", "source": "glass"})
        report["error"] = msg

    return {"pins": pins, "findings": findings, "report": report}


async def _fetch_finch_seed(q: str, *, refresh: bool = False) -> tuple[dict[str, Any] | None, str | None]:
    """Run Finch Seed Engine — embedded by default, HTTP only if FINCH_BASE set."""
    if FINCH_BASE:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                r = await client.get(
                    f"{FINCH_BASE}/api/seed",
                    params={"q": q, "verbose": "true", "refresh": "true" if refresh else "false"},
                )
                r.raise_for_status()
                data = r.json()
                if not isinstance(data, dict):
                    return None, "Finch returned invalid payload"
                return data, None
        except Exception as e:
            return None, f"Finch HTTP error: {e}"

    return await fetch_seed_package(q, refresh=refresh)


def _profile_section_items(profile: dict[str, Any], key: str) -> list[str]:
    block = profile.get(key)
    if not block or not isinstance(block, dict):
        return []
    items: list[str] = []
    for k, v in block.items():
        if v is None or v == "" or v == [] or v == {}:
            continue
        if isinstance(v, list):
            items.append(f"{k}: {len(v)} item(s)")
        elif isinstance(v, dict):
            items.append(f"{k}: {len(v)} field(s)")
        else:
            items.append(f"{k}: {v}")
    return items[:8]


def _parse_coords_pair(raw: Any) -> tuple[float, float] | None:
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        try:
            lat, lng = float(raw[0]), float(raw[1])
            return (lat, lng) if valid_map_coords(lat, lng) else None
        except (TypeError, ValueError):
            return None
    s = str(raw).strip()
    if "," not in s:
        return None
    parts = [p.strip() for p in s.split(",")]
    if len(parts) < 2:
        return None
    try:
        lat, lng = float(parts[0]), float(parts[1])
        return (lat, lng) if valid_map_coords(lat, lng) else None
    except ValueError:
        return None


def _subject_geo_from_package(package: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract map-placable locations tied to the subject — not operator GPS."""
    out: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()

    def add(lat: float, lng: float, label: str, source: str, *, gps: bool = True) -> None:
        key = (int(lat * 1000), int(lng * 1000))
        if key in seen:
            return
        seen.add(key)
        out.append(
            {
                "lat": lat,
                "lng": lng,
                "label": (label or "Subject location")[:80],
                "source": source,
                "gps": gps,
            }
        )

    pp = package.get("primary_profile") or {}
    pl = pp.get("physical_locations") or {}
    cur = pl.get("current_location") or {}
    coords = _parse_coords_pair(cur.get("gps_coordinates"))
    if coords:
        add(coords[0], coords[1], cur.get("address") or "Current location", "physical_locations")

    for loc in pl.get("historical_locations") or []:
        coords = _parse_coords_pair(loc.get("gps_coordinates"))
        if coords:
            add(coords[0], coords[1], loc.get("address") or "Historical location", "physical_locations")

    for f in package.get("raw_findings") or []:
        if not isinstance(f, dict):
            continue
        meta = f.get("meta") or {}
        coords = _parse_coords_pair((meta.get("lat"), meta.get("lon")))
        if not coords:
            coords = _parse_coords_pair((meta.get("latitude"), meta.get("longitude")))
        if not coords:
            coords = _parse_coords_pair(meta.get("coordinates"))
        if coords:
            add(
                coords[0],
                coords[1],
                str(f.get("value") or f.get("kind") or "Geo finding")[:80],
                str(f.get("source") or "finding"),
            )

    return out[:8]


def _identity_seed_types() -> set[str]:
    return {"name", "email", "handle", "phone", "username", "company", "combined"}


def _seed_report_from_finch(
    package: dict[str, Any],
    q: str,
    engagement: dict[str, Any],
    *,
    finch_base: str = "embedded",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    declared = engagement.get("declared_locus") or {}
    meta = package.get("metadata") or {}
    pp = package.get("primary_profile") or {}
    ids = pp.get("primary_identifiers") or {}
    photos = package.get("profile_photos") or pp.get("profile_photos") or []
    kind = package.get("seed_type") or _classify_seed(q)
    normalised = package.get("normalised") or package.get("seed") or q
    full_name = ids.get("full_name") or normalised

    contact = pp.get("contact") or {}
    social = contact.get("social_media") or []
    digital = pp.get("digital_footprint") or {}

    pivots = _seed_pivots(q, kind)
    if kind == "name" and social:
        for s in social[:3]:
            url = s.get("url") or ""
            if "linkedin.com" in url:
                pivots.append({"label": "LinkedIn", "skill": "osint", "query": url.split("linkedin.com/in/")[-1].split("/")[0]})
            elif s.get("handle"):
                pivots.append({"label": s.get("platform", "social"), "skill": "seed", "query": "@" + str(s["handle"]).lstrip("@")})

    report: dict[str, Any] = {
        "domain": "seed",
        "query": q,
        "status": "ok",
        "engine": "finch",
        "finch_base": finch_base,
        "identity": {
            "display": q,
            "type": kind,
            "normalized": normalised,
            "full_name": full_name,
        },
        "package": {
            "seed": package.get("seed"),
            "seed_type": kind,
            "normalised": normalised,
            "full_name": full_name,
            "confidence_score": meta.get("confidence_score"),
            "completeness_score": meta.get("completeness_score"),
            "verdict": meta.get("verdict"),
            "total_findings": meta.get("total_findings"),
            "sources_used": meta.get("sources_used") or [],
            "queries_performed": meta.get("queries_performed"),
            "elapsed_seconds": meta.get("elapsed_seconds"),
            "cache": package.get("cache"),
        },
        "photos": photos[:12],
        "photo_count": len(photos),
        "sections": {
            "identifiers": _profile_section_items(pp, "primary_identifiers"),
            "contact": _profile_section_items(pp, "contact"),
            "digital": _profile_section_items(pp, "digital_footprint"),
            "associations": _profile_section_items(pp, "associations"),
            "property": _profile_section_items(pp, "property_assets"),
            "criminal": _profile_section_items(pp, "criminal_legal"),
        },
        "social_media": social[:8],
        "secondary_count": len(package.get("secondary_profiles") or []),
        "engagement_locus": {
            "label": declared.get("label"),
            "lat": declared.get("lat"),
            "lng": declared.get("lng"),
            "gps": declared.get("gps"),
            "note": "Operator working location — not inferred subject address",
        },
        "subject_geo": [],
        "map_status": "unplaced",
        "pivots": pivots,
        "next_rails": [],
    }

    subject_geo = _subject_geo_from_package(package)
    report["subject_geo"] = subject_geo

    findings: list[dict[str, Any]] = []
    pins: list[dict[str, Any]] = []

    summary_parts = [full_name]
    if meta.get("total_findings"):
        summary_parts.append(f"{meta['total_findings']} findings")
    if meta.get("confidence_score") is not None:
        summary_parts.append(f"confidence {meta['confidence_score']}%")
    findings.append(
        {
            "summary": "Seed: " + " · ".join(summary_parts),
            "claim_level": "observed",
            "source": "seed",
        }
    )

    # Globe pins only for subject-correlated geo — never slap a name onto operator GPS.
    for sg in subject_geo:
        pins.append(
            {
                "source": "seed",
                "kind": "subject_location",
                "label": sg["label"],
                "lat": sg["lat"],
                "lng": sg["lng"],
                "gps": sg.get("gps", True),
                "meta": {
                    "query": q,
                    "seed_type": kind,
                    "full_name": full_name,
                    "geo_source": sg.get("source"),
                    "note": "From intelligence package — not operator GPS",
                },
            }
        )

    if pins:
        report["map_status"] = "subject_geo"
        report["next_rails"] = [
            f"Review {len(photos)} photo(s) and {meta.get('total_findings') or 0} findings below",
            f"{len(pins)} subject location(s) mapped from package",
        ]
    elif kind in _identity_seed_types():
        report["map_status"] = "unplaced"
        report["next_rails"] = [
            f"Review {len(photos)} photo(s) and {meta.get('total_findings') or 0} findings below",
            "No subject geo in package — identity is not pinned to your laptop GPS",
        ]
        if pivots:
            report["next_rails"].append("Pivot: " + ", ".join(p["label"] for p in pivots[:3]))
    else:
        report["status"] = "partial"
        report["map_status"] = "unplaced"
        report["next_rails"] = ["No correlated geo for this seed type yet"]

    return pins, findings, report


async def run_seed(query: str, engagement: dict[str, Any]) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        return {
            "pins": [],
            "findings": [{"summary": "Seed: empty query", "claim_level": "observed", "source": "seed"}],
            "report": {"domain": "seed", "query": q, "status": "error", "error": "Enter a seed query"},
        }

    package, err = await _fetch_finch_seed(q)
    if package:
        pins, findings, report = _seed_report_from_finch(package, q, engagement)
        kind = report.get("package", {}).get("seed_type") or _classify_seed(q)
        if not pins and kind == "ip":
            geo = await geolocate_ip(q.split("/")[0].strip())
            if geo:
                pins.append(
                    {
                        "source": "seed",
                        "kind": "infra",
                        "label": q,
                        "lat": geo["lat"],
                        "lng": geo["lng"],
                        "gps": geo.get("gps", True),
                        "meta": {
                            "query": q,
                            "city": geo.get("city"),
                            "country": geo.get("country"),
                            "org": geo.get("org"),
                            "schematic": geo.get("schematic"),
                            "note": "IP geo from intelligence — not operator GPS",
                        },
                    }
                )
                report["map_status"] = "infra_geo"
                report["subject_geo"] = [
                    {"lat": geo["lat"], "lng": geo["lng"], "label": q, "source": "ip_geo", "gps": True}
                ]
        return {"pins": pins, "findings": findings, "report": report}

    # Finch offline — fall back to local classify-only stub with clear error
    declared = engagement.get("declared_locus") or {}
    kind = _classify_seed(q)
    pivots = _seed_pivots(q, kind)
    report: dict[str, Any] = {
        "domain": "seed",
        "query": q,
        "status": "error",
        "engine": "stub",
        "error": err or "Finch unavailable",
        "identity": {"display": q, "type": kind, "normalized": q},
        "engagement_locus": {
            "label": declared.get("label"),
            "lat": declared.get("lat"),
            "lng": declared.get("lng"),
            "note": "Operator working location only",
        },
        "map_status": "unplaced",
        "pivots": pivots,
        "next_rails": [f"Check Finch at {FINCH_ROOT} — re-run ./start.sh from ARIA"],
    }
    return {
        "pins": [],
        "findings": [
            {
                "summary": f"Seed failed: {err}",
                "claim_level": "observed",
                "source": "seed",
            }
        ],
        "report": report,
    }


async def run_web3(query: str, engagement: dict[str, Any]) -> dict[str, Any]:
    q = (query or "").strip()
    declared = engagement.get("declared_locus") or {}
    pins: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "domain": "web3",
        "query": q,
        "status": "error",
        "address": q,
        "explorers": [],
        "geo_honesty": "No GPS is derived from a 0x address — chain identity ≠ physical location.",
    }

    if not _HEX_RE.match(q):
        msg = f"Expected 0x + 40 hex, got {q!r}"
        findings.append({"summary": f"Web3: {msg}", "claim_level": "observed", "source": "web3"})
        report["error"] = msg
        return {"pins": pins, "findings": findings, "report": report}

    short = f"{q[:6]}…{q[-4:]}"
    report.update(
        {
            "status": "ok",
            "short": short,
            "explorers": [
                {"name": "Etherscan", "url": f"https://etherscan.io/address/{q}"},
                {"name": "Blockchair", "url": f"https://blockchair.com/ethereum/address/{q}"},
                {"name": "DeBank", "url": f"https://debank.com/profile/{q}"},
            ],
            "locus": {
                "label": declared.get("label"),
                "lat": declared.get("lat"),
                "lng": declared.get("lng"),
            },
        }
    )

    lat, lng = declared.get("lat"), declared.get("lng")
    if valid_map_coords(lat, lng):
        pins.append(
            {
                "source": "web3",
                "kind": "contract_or_wallet",
                "label": short,
                "lat": float(lat) + 0.02,
                "lng": float(lng) + 0.02,
                "gps": False,
                "meta": {
                    "address": q,
                    "note": "Pinned via engagement declared locus — not invented GPS",
                    "explorer": f"https://etherscan.io/address/{q}",
                },
            }
        )
        findings.append(
            {
                "summary": f"Web3: {short} linked to engagement locus (honest geo)",
                "claim_level": "observed",
                "source": "web3",
            }
        )
        report["map_status"] = "anchored"
    else:
        findings.append(
            {
                "summary": f"Web3: {short} recorded — set declared locus to place on globe",
                "claim_level": "observed",
                "source": "web3",
            }
        )
        report["status"] = "partial"
        report["map_status"] = "unplaced"

    return {"pins": pins, "findings": findings, "report": report}


async def run_osint(query: str, engagement: dict[str, Any]) -> dict[str, Any]:
    q = (query or "").strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0]
    pins: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "domain": "osint",
        "query": q,
        "status": "error",
        "dns": {"a": [], "aaaa": [], "mx": []},
        "hosts": [],
    }

    if _IP_RE.match(q):
        glass = await run_glass(q, engagement)
        glass["report"]["domain"] = "osint"
        glass["report"]["note"] = "IP query routed through infra resolver"
        return glass

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            a_r = await client.get("https://dns.google/resolve", params={"name": q, "type": "A"})
            a_data = a_r.json()
            mx_r = await client.get("https://dns.google/resolve", params={"name": q, "type": "MX"})
            mx_data = mx_r.json()
    except Exception as e:
        msg = f"DNS failed for {q}: {e}"
        findings.append({"summary": f"OSINT: {msg}", "claim_level": "observed", "source": "osint"})
        report["error"] = msg
        return {"pins": pins, "findings": findings, "report": report}

    answers = [
        a.get("data")
        for a in (a_data.get("Answer") or [])
        if a.get("type") == 1 and a.get("data")
    ]
    mx = [
        a.get("data")
        for a in (mx_data.get("Answer") or [])
        if a.get("type") == 15 and a.get("data")
    ]
    report["dns"] = {"a": answers, "aaaa": [], "mx": mx[:5]}

    if not answers:
        msg = f"No A records for {q}"
        findings.append({"summary": f"OSINT: {msg}", "claim_level": "observed", "source": "osint"})
        report["error"] = msg
        return {"pins": pins, "findings": findings, "report": report}

    hosts: list[dict[str, Any]] = []
    for ip in answers[:5]:
        geo = await geolocate_ip(ip)
        host = {"ip": ip, "geo": geo}
        hosts.append(host)
        if not geo:
            continue
        pins.append(
            {
                "source": "osint",
                "kind": "infra",
                "label": f"{q} → {ip}",
                "lat": geo["lat"],
                "lng": geo["lng"],
                "gps": geo["gps"],
                "meta": {
                    "domain": q,
                    "ip": ip,
                    "city": geo.get("city"),
                    "country": geo.get("country"),
                    "org": geo.get("org"),
                },
            }
        )

    report.update({"status": "ok", "hosts": hosts, "host_count": len(hosts), "pin_count": len(pins)})
    findings.append(
        {
            "summary": f"OSINT: {q} → {', '.join(answers[:3])} ({len(pins)} geo hosts)",
            "claim_level": "observed",
            "source": "osint",
        }
    )
    return {"pins": pins, "findings": findings, "report": report}


async def run_rf(query: str, engagement: dict[str, Any]) -> dict[str, Any]:
    """RF pull — returns device roster for the RF page (query = Root base URL)."""
    base = (query or "http://192.168.4.1").strip().rstrip("/")
    pins: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "domain": "rf",
        "query": base,
        "status": "error",
        "devices": [],
        "scanner_gps": None,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/api/devices")
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        msg = f"Root unreachable at {base}: {e}"
        findings.append({"summary": f"RF: {msg}", "claim_level": "observed", "source": "rf"})
        report["error"] = msg
        return {"pins": pins, "findings": findings, "report": report}

    devices = data.get("devices") if isinstance(data, dict) else None
    if devices is None and isinstance(data, list):
        devices = data
    if devices is None:
        devices = []

    scanner_gps = data.get("scanner_gps") if isinstance(data, dict) else None
    report.update(
        {
            "status": "ok",
            "devices": devices[:100],
            "count": len(devices),
            "scanner_gps": scanner_gps,
            "bands": sorted({d.get("band") or d.get("type") or "?" for d in devices if isinstance(d, dict)}),
        }
    )

    declared = engagement.get("declared_locus") or {}
    lat, lng = declared.get("lat"), declared.get("lng")
    for i, dev in enumerate(devices[:20]):
        if not isinstance(dev, dict):
            continue
        label = dev.get("ssid") or dev.get("mac") or dev.get("name") or f"device-{i}"
        if valid_map_coords(lat, lng):
            pins.append(
                {
                    "source": "rf",
                    "kind": "rf_device",
                    "label": str(label)[:60],
                    "lat": float(lat) + (i % 5) * 0.001,
                    "lng": float(lng) + (i // 5) * 0.001,
                    "gps": False,
                    "meta": {
                        "mac": dev.get("mac"),
                        "rssi": dev.get("rssi"),
                        "band": dev.get("band"),
                        "note": "RF device anchored near engagement locus — bearing not measured",
                    },
                }
            )

    findings.append(
        {
            "summary": f"RF: {len(devices)} device(s) from Root @ {base}",
            "claim_level": "observed",
            "source": "rf",
        }
    )
    return {"pins": pins, "findings": findings, "report": report}


RUNNERS = {
    "seed": run_seed,
    "glass": run_glass,
    "web3": run_web3,
    "osint": run_osint,
    "rf": run_rf,
}
