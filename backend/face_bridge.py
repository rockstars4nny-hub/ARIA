"""Finch Visage / FaceSearch bridge — embedded subprocess or FINCH_BASE HTTP."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
from typing import Any

import httpx

from .finch_bridge import FINCH_ROOT, _finch_python, finch_available

FINCH_BASE = os.environ.get("FINCH_BASE", "").rstrip("/")
FACE_TIMEOUT = float(os.environ.get("ARIA_FACE_TIMEOUT", "300"))

_EMBED_SCRIPT = r"""
import asyncio, json, sys
sys.path.insert(0, %r)

payload = json.loads(sys.stdin.read())
action = payload.get("action")

def b64img():
    raw = payload.get("image_b64") or ""
    if not raw:
        return None
    import base64
    return base64.b64decode(raw)

async def main():
    if action == "health":
        from backend import face_api
        from backend.visage import reverse_search
        print(json.dumps({
            "face": face_api.status(),
            "reverse": reverse_search.health(),
        }))
        return
    if action == "consent":
        from backend.visage import ui as visage_ui
        from backend.visage.public_sweep import CONSENT_TEXT
        print(json.dumps({"text": CONSENT_TEXT, **visage_ui.consent_banner()}))
        return
    if action == "progress":
        from backend.visage.public_sweep import get_progress
        print(json.dumps(get_progress()))
        return
    if action == "resolve_avatar":
        import base64
        import httpx
        from backend.visage import social_avatars
        handle = (payload.get("handle") or "").strip().lstrip("@")
        platform = (payload.get("platform") or "").strip().lower()
        if not handle:
            raise ValueError("handle required")
        accounts = [(platform, handle)] if platform else None
        recs = social_avatars.extract_avatar_urls(None, usernames=[handle], accounts=accounts)
        ua = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        image_b64 = ""
        chosen = None
        with httpx.Client(timeout=20.0, follow_redirects=True, headers={"User-Agent": ua}) as client:
            for rec in recs:
                url = rec.get("url") or ""
                if not url:
                    continue
                try:
                    r = client.get(url)
                    if r.status_code != 200 or len(r.content or b"") < 400:
                        continue
                    ct = (r.headers.get("content-type") or "").lower()
                    if "image" not in ct and not url.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
                        continue
                    image_b64 = base64.b64encode(r.content).decode("ascii")
                    chosen = rec
                    break
                except Exception:
                    continue
        print(json.dumps({
            "handle": handle,
            "platform": platform or None,
            "avatars": recs[:24],
            "chosen": chosen,
            "image_b64": image_b64,
            "ok": bool(image_b64),
        }, default=str))
        return
    if action == "detect":
        from backend import face_api
        data = b64img()
        if not data:
            raise ValueError("empty image")
        print(json.dumps(face_api.detect_report(data)))
        return
    if action == "match":
        from backend import face_api
        data = b64img()
        if not data:
            raise ValueError("empty image")
        print(json.dumps(face_api.match(
            data,
            threshold=payload.get("threshold"),
            top_k=int(payload.get("top_k") or 5),
        )))
        return
    if action == "sweep":
        from backend.visage import ui as visage_ui
        from backend.visage.public_sweep import sweep_and_match, session_findings, CONSENT_TEXT
        if not payload.get("consent"):
            raise PermissionError(CONSENT_TEXT)
        data = b64img()
        name = (payload.get("person_name") or "").strip() or "photo-seed"
        aliases = list(payload.get("aliases") or [])
        handle = (payload.get("handle") or "").strip().lstrip("@")
        if handle and handle not in aliases:
            aliases.insert(0, handle)
        if not data and not name and not aliases:
            raise ValueError("upload a photo or enter @handle / name")
        result = sweep_and_match(
            None,
            name,
            aliases,
            query_image_bytes=data,
            threshold=float(payload.get("threshold") or 0.6),
            max_per_engine=int(payload.get("max_per_engine") or 30),
            consent=True,
            reverse_first=True,
        )
        out = result.to_dict()
        out["dossier_section"] = visage_ui.dossier_section(result)
        out["findings"] = [f.to_dict() for f in session_findings(name)]
        if payload.get("probe_source"):
            out["probe_source"] = payload.get("probe_source")
        if payload.get("avatar_sources"):
            out["avatar_sources"] = payload.get("avatar_sources")
        print(json.dumps(out, default=str))
        return
    raise ValueError(f"unknown action: {action}")

asyncio.run(main())
""" % str(FINCH_ROOT)


async def _http_get(path: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{FINCH_BASE}{path}")
        r.raise_for_status()
        return r.json()


async def _http_post_multipart(
    path: str,
    image_bytes: bytes,
    fields: dict[str, Any],
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=FACE_TIMEOUT) as client:
        files = {"file": ("probe.jpg", image_bytes, "image/jpeg")}
        data = {k: str(v) for k, v in fields.items()}
        r = await client.post(f"{FINCH_BASE}{path}", files=files, data=data)
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail", r.text)
            except Exception:
                detail = r.text
            raise RuntimeError(str(detail)[:500])
        return r.json()


async def _embed_json(action: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not finch_available():
        return {"ok": False, "error": f"Finch not found at {FINCH_ROOT}"}

    stdin = json.dumps({"action": action, **payload}).encode("utf-8")

    try:
        proc = await asyncio.create_subprocess_exec(
            _finch_python(),
            "-c",
            _EMBED_SCRIPT,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(FINCH_ROOT),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(stdin), timeout=FACE_TIMEOUT)
    except asyncio.TimeoutError:
        return {"ok": False, "error": f"FaceSearch timed out (>{int(FACE_TIMEOUT)}s)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

    if proc.returncode != 0:
        err = (stderr or b"").decode("utf-8", errors="replace").strip()
        return {"ok": False, "error": err[:500] or f"exit {proc.returncode}"}

    raw = (stdout or b"").decode("utf-8", errors="replace").strip()
    if not raw:
        return {"ok": False, "error": "empty response from Visage engine"}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"JSON parse error: {e}"}


def _b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("ascii")


def parse_handle_query(raw: str) -> tuple[str, str]:
    """Parse @handle, platform:handle, or platform/handle → (platform, handle)."""
    q = (raw or "").strip()
    if not q:
        return "", ""
    if " " in q and not q.startswith("@") and ":" not in q and not q.startswith("http"):
        return "", ""
    if q.startswith("@"):
        return "", q.lstrip("@").split()[0]
    if ":" in q and not q.startswith("http"):
        platform, handle = q.split(":", 1)
        return platform.strip().lower(), handle.strip().lstrip("@").split()[0]
    if "/" in q and " " not in q and not q.startswith("http"):
        platform, handle = q.split("/", 1)
        if platform and handle:
            return platform.strip().lower(), handle.strip().lstrip("@").split()[0]
    return "", q.lstrip("@").split()[0]


def is_handle_like(raw: str) -> bool:
    h = (raw or "").strip().lstrip("@")
    return bool(h) and " " not in h and bool(re.match(r"^[A-Za-z0-9._-]{1,64}$", h))


async def resolve_social_avatar(handle: str, platform: str = "") -> dict[str, Any]:
    """Fetch public profile photo candidates; download first usable image."""
    handle = (handle or "").strip().lstrip("@")
    if not handle:
        raise ValueError("enter @handle or platform:handle")
    data = await _embed_json("resolve_avatar", {"handle": handle, "platform": platform or ""})
    if data.get("error"):
        raise RuntimeError(data["error"])
    if not data.get("ok"):
        n = len(data.get("avatars") or [])
        raise ValueError(
            f"Could not download a profile photo for @{handle} "
            f"({n} public URL(s) tried). Upload a photo instead."
        )
    return data


async def health() -> dict[str, Any]:
    if FINCH_BASE:
        try:
            face = await _http_get("/api/face/health")
            rev = await _http_get("/api/face/reverse/health")
            return {"mode": "http", "base": FINCH_BASE, "face": face, "reverse": rev}
        except Exception as e:
            return {"mode": "http", "available": False, "error": str(e)}
    if not finch_available():
        return {"mode": "embedded", "available": False, "root": str(FINCH_ROOT)}
    data = await _embed_json("health", {})
    if data.get("error"):
        return {"mode": "embedded", "available": False, **data}
    return {"mode": "embedded", "available": True, "root": str(FINCH_ROOT), **data}


async def consent() -> dict[str, Any]:
    if FINCH_BASE:
        return await _http_get("/api/face/public-sweep/consent")
    return await _embed_json("consent", {})


async def progress() -> dict[str, Any]:
    if FINCH_BASE:
        return await _http_get("/api/face/public-sweep/progress")
    return await _embed_json("progress", {})


async def detect(image_bytes: bytes) -> dict[str, Any]:
    if FINCH_BASE:
        return await _http_post_multipart("/api/face/detect", image_bytes, {})
    return await _embed_json("detect", {"image_b64": _b64(image_bytes)})


async def match(image_bytes: bytes, *, threshold: float | None = None, top_k: int = 5) -> dict[str, Any]:
    if FINCH_BASE:
        fields: dict[str, Any] = {"top_k": top_k}
        if threshold is not None:
            fields["threshold"] = threshold
        return await _http_post_multipart("/api/face/match", image_bytes, fields)
    return await _embed_json(
        "match",
        {"image_b64": _b64(image_bytes), "threshold": threshold, "top_k": top_k},
    )


async def public_sweep(
    image_bytes: bytes | None = None,
    *,
    handle: str = "",
    platform: str = "",
    person_name: str = "",
    aliases: list[str] | None = None,
    consent: bool = False,
    threshold: float = 0.6,
    max_per_engine: int = 30,
) -> dict[str, Any]:
    if not consent:
        raise PermissionError(await consent_banner_text())

    avatar_meta: dict[str, Any] = {}
    probe_source = "upload"
    h = (handle or "").strip().lstrip("@")
    handle_like = is_handle_like(h)
    name = (person_name or "").strip()
    if name == "photo-seed":
        name = ""

    if not image_bytes and h and handle_like:
        try:
            avatar_meta = await resolve_social_avatar(h, platform)
            image_bytes = base64.b64decode(avatar_meta.get("image_b64") or "")
            probe_source = "social_avatar"
        except ValueError:
            avatar_meta = {}

    if not name:
        if h and not handle_like:
            name = h
            h = ""
        elif h:
            name = h

    if not image_bytes and not name and not aliases:
        raise ValueError("upload a photo or enter @handle / name")

    if image_bytes and not name and not aliases:
        raise ValueError(
            "add a subject name or @handle with the photo — "
            "reverse image upload alone often finds nothing without a name search"
        )

    label = name or h or "photo-seed"
    extra = list(aliases or [])
    if h and h not in extra:
        extra.insert(0, h)

    if FINCH_BASE:
        if not image_bytes:
            raise ValueError("HTTP Finch mode requires a probe photo — use embedded ARIA mode for name-only search")
        result = await _http_post_multipart(
            "/api/face/reverse",
            image_bytes,
            {
                "person_name": label,
                "aliases": ",".join(extra),
                "consent": "true",
                "threshold": threshold,
                "max_per_engine": max_per_engine,
            },
        )
    else:
        result = await _embed_json(
            "sweep",
            {
                "image_b64": _b64(image_bytes) if image_bytes else "",
                "person_name": label,
                "aliases": extra,
                "handle": h,
                "consent": True,
                "threshold": threshold,
                "max_per_engine": max_per_engine,
                "probe_source": probe_source if image_bytes else "name_search",
                "avatar_sources": avatar_meta.get("avatars") or [],
            },
        )

    if isinstance(result, dict):
        if probe_source == "social_avatar":
            result["probe_source"] = probe_source
            result["avatar_sources"] = avatar_meta.get("avatars") or []
            result["chosen_avatar"] = avatar_meta.get("chosen")
        elif not image_bytes:
            result["probe_source"] = "name_search"
    return result


async def consent_banner_text() -> str:
    data = await consent()
    return str(data.get("text") or data.get("message") or "Consent required for FaceSearch.")
