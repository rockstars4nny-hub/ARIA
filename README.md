# ARIA — Advanced Recon Intelligence Agent

**One command. One server. One dashboard.**

## Capabilities

| Area | What it does |
|------|----------------|
| **Root tab** | ESP32 kit live iframe (`192.168.4.1`), ping, pull devices, open in new tab |
| **Stem · Radar** | RSSI range map, Root device merge, engagement pins, filters, laptop GPS → Root |
| **Run · Seed** | Finch Seed Engine embedded — identity package (name, email, handle, photos, findings) |
| **Run · OSINT** | Domain/DNS infra recon, per-host geo table |
| **Run · Glass** | LAN IoT/camera port probe on authorized CIDRs |
| **Run · Web3** | On-chain address / contract intel |
| **Run · RF** | Pull Root Wi‑Fi device list into engagement |
| **Engagements** | ROE jobs, declared locus, pins + findings audit trail, export / delete / clear |
| **Geo honesty** | Identity seeds only map when package contains subject-correlated geo |
| **GPS** | Browser geolocation + optional gpsd; operator locus separate from subject pins |

**Dashboard**
- Single URL (`http://127.0.0.1:8877`) — Root, Stem · Radar, Run, Engagements in one UI
- Quick start / custom engagement, laptop GPS, GPS → engagement from top bar

**Skills (Run tab)**
- **Seed** — embedded Finch identity package (photos, sources, findings, pivots)
- **OSINT** — DNS A/MX, host geo table, infra-focused domain report
- **Glass** — authorized LAN IoT/camera surface port probe
- **Web3** — chain address / contract intel stub
- **RF** — Root kit device pull merged into engagement

**Engagement workflow**
- Declared locus (operator GPS), pins, findings history per job
- Export audit JSON, delete engagement, clear audit trail
- Engagement cards open Run tab with active job selected

**Integrations**
- Finch Seed Engine embedded via Finch venv (no port 8765 by default)
- Root ESP32 @ `192.168.4.1` — iframe + API pull into radar
- Optional `FINCH_BASE` for legacy separate Finch HTTP server

## Start

**ARIA Kit (integrated — one server):**
```bash
cd ~/Aria && ./start.sh
```

Open **http://127.0.0.1:8877**

**Finch web app (standalone GUI, optional):**
```bash
cd ~/Finch && ./start.sh
```

Open **http://localhost:8765**

That's it for ARIA. Finch Seed Engine runs **embedded** inside ARIA — no second terminal unless you want the standalone Finch UI.

## What's on the dashboard

| Tab | What |
|-----|------|
| **Root** | ESP32 kit @ 192.168.4.1 (join `root` / `root-radar`) |
| **Stem · Radar** | Signal map + Root pull |
| **Run** | Seed · OSINT · Glass · Web3 · RF |
| **Engagements** | Jobs, export, delete, clear audit |

Top bar: Quick start · Laptop GPS · GPS → engagement · Custom

## Integrated protocol

- **One server:** ARIA on `:8877`
- **Finch seed:** called in-process via Finch venv (no separate `./start.sh` for Finch)
- **Optional:** set `FINCH_BASE=http://127.0.0.1:8765` only if you want legacy separate Finch HTTP server

## Env (optional)

| Var | Default |
|-----|---------|
| `FINCH_ROOT` | `/home/Hatari/repos/PT/finch` |
| `ARIA_PORT` | `8877` |
| `ARIA_HOST` | `127.0.0.1` |

## Laptop GPS

Browser geolocation fills engagement locus. Name seeds are **not** pinned to your GPS unless the intelligence package contains subject geo.

## Map

MapLibre + OpenFreeMap — no API key.
