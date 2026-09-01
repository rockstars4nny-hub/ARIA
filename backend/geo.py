"""Geo honesty for ARIA globe pins — no null-island proof, LAN schematic only."""
from __future__ import annotations

import ipaddress
from typing import Optional


def is_non_routable_ip(ip: str) -> bool:
    try:
        obj = ipaddress.ip_address((ip or "").split("%")[0].strip())
    except ValueError:
        return False
    return bool(
        obj.is_private
        or obj.is_loopback
        or obj.is_link_local
        or obj.is_multicast
        or obj.is_reserved
        or (obj.version == 4 and obj in ipaddress.ip_network("100.64.0.0/10"))
    )


def valid_map_coords(lat: Optional[float], lng: Optional[float]) -> bool:
    try:
        if lat is None or lng is None:
            return False
        la = float(lat)
        ln = float(lng)
    except (TypeError, ValueError):
        return False
    if not (-90.0 <= la <= 90.0 and -180.0 <= ln <= 180.0):
        return False
    if abs(la) < 0.35 and abs(ln) < 0.35:
        return False
    return True


def lan_schematic_coords(ip: str) -> tuple[float, float] | None:
    """Deterministic fake layout for private hosts — NOT GPS."""
    try:
        obj = ipaddress.ip_address((ip or "").split("%")[0].strip())
        if obj.version != 4:
            return None
        parts = str(obj).split(".")
        lat = 39.0 + (int(parts[2]) % 40) * 0.04 + (int(parts[3]) % 10) * 0.004
        lng = -98.0 + (int(parts[3]) % 40) * 0.05 + (int(parts[2]) % 10) * 0.005
        return (lat, lng)
    except Exception:
        return None
