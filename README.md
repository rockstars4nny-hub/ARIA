# ARIA — Advanced Recon Intelligence Agent

**One command. One server. One dashboard.**

## For potential customers

ARIA is the **field operator cockpit** for authorized recon and intelligence work — one browser session, one audit trail, one exportable case file. Built for teams who need **real capability in the field**, not a pile of disconnected scripts.

| If you need to… | ARIA delivers |
|-----------------|---------------|
| **See what's around the kit in real time** | Live ESP32 Root dashboard + RSSI radar map — Wi‑Fi probes, beacons, vendors, signal strength |
| **Build an identity package fast** | Embedded Finch Seed — name, email, @handle → photos, sources, findings, pivots on the same page |
| **Find public photos of a subject** | **FaceSearch AI** — search by name, @handle, or photo; graded matches; engagement audit |
| **Map digital infrastructure** | OSINT domain/DNS recon with per-host geo — no tab-hopping |
| **Probe authorized LAN surfaces** | Glass IoT/camera/drone port scan on declared CIDRs |
| **Follow on-chain leads** | Web3 wallet / contract intel from the Run tab |
| **Run a defensible engagement** | ROE-backed jobs, declared locus, timestamped findings, JSON export, delete / clear audit |
| **Avoid misleading geo** | Geo-honest seeds — identity queries are **not** pinned to operator laptop GPS unless the package carries subject geo |

**Typical buyers:** private investigators, corporate security & insider-threat teams, authorized red teams, boutique intel firms, and kit operators running Root + laptop in the field.

**What you get on day one:** `./start.sh` → full dashboard at `:8877` — Root, Stem · Radar, Run skills, FaceSearch AI, Engagements. Finch Seed runs **embedded** (no second server).

**Authorization:** ARIA is for **lawful, authorized use only** — consent, ROE, and jurisdiction are your responsibility. FaceSearch includes an explicit consent gate before any search runs.

---

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

### FaceSearch AI (dedicated tab)

- Search by **subject name alone** (e.g. `Jane Smith`) — public photo discovery via DDG/Bing when reverse upload is unavailable.
- Upload a **probe photo** **and** add a **name or @handle** for best results (`@user`, `instagram:handle`, `github:user`).
- **Fetch profile photo** pulls public avatars from GitHub, X/Twitter, Instagram, Facebook, Reddit, LinkedIn.
- Run **reverse face search** on Yandex + Bing Visual with local **high / med / low / weak** grading when a clear face is detected.
- **Detect faces** locally before you search; results append to your active engagement audit.

### Run a proper engagement (Engagements)

- **Quick-start a case** with ROE, title, and declared locus (your laptop GPS or custom).
- **Every skill run appends to the audit trail** — pins, findings, timestamps — exportable as JSON for deliverables.
- **Delete a job or wipe its audit** when the engagement ends.
- **Switch cases** from the Engagements tab; open one and jump straight to Run.

### Built-in honesty

- Searching a **person name** does **not** pin that person to your laptop GPS. Pins appear only when the intelligence package actually contains **subject-correlated geo** — not operator location theater.

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
| **FaceSearch AI** | Name / @handle / photo search · local face grading · engagement audit |
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
