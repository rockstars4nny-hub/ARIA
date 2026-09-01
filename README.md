# ARIA — Advanced Recon Intelligence Agent

**One command. One server. One dashboard.**

## What you can do with ARIA

ARIA is the **operator cockpit** for a field recon kit. One browser window runs your ESP32 sniffer, your radar view, your intel skills, and your case file — no juggling terminals or ports.

### See what's around you (Root + Stem · Radar)

- **Join the kit Wi‑Fi** (`root` / `root-radar`) and watch the **live Root dashboard** inside ARIA — same view as `192.168.4.1`, no tab-hopping.
- **Pull every device Root hears** — Wi‑Fi probes, beacons, MACs, SSIDs, vendors, RSSI — straight into the **Stem · Radar** map.
- **See who's close vs far** on an RSSI range map; filter by band, freshness, or engagement pins.
- **Push your laptop GPS to Root** so field captures carry operator location (when you choose to).

### Run intel on a target (Run tab)

Type a seed and get a **full domain report on the same page**:

- **Seed** — drop a **name, email, or @handle** and get an identity package: photos, sources, findings, pivots. Powered by Finch Seed Engine, **embedded** — no second server.
- **OSINT** — point at a **domain or IP** and get DNS, mail hosts, infra layout, and a per-host geo table.
- **Glass** — scan an **authorized LAN** for open IoT/camera/drone ports and live surface probes.
- **Web3** — look up a **wallet or contract** for on-chain context.
- **RF** — pull Root's live device list into your active engagement as structured findings.

### Run a proper engagement (Engagements)

- **Quick-start a case** with ROE, title, and declared locus (your laptop GPS or custom).
- **Every skill run appends to the audit trail** — pins, findings, timestamps — exportable as JSON for deliverables.
- **Delete a job or wipe its audit** when the engagement ends.
- **Switch cases** from the Engagements tab; open one and jump straight to Run.

### Built-in honesty

- Searching **"Damond Nixon"** does **not** pin that person to your laptop GPS. Pins appear only when the intelligence package actually contains **subject-correlated geo** — not operator location theater.

```bash
cd ~/Aria && ./start.sh   # one command → http://127.0.0.1:8877
```

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
