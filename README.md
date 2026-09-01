# ARIA — Advanced Recon Intelligence Agent

**One command. One server. One dashboard.**

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
