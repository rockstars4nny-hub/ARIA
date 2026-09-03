/* ARIA Kit — OmniScan (root ./omni command console + capabilities) */
window.ARIAOmni = (function () {
  const CAPS = [
    {
      cat: "Core",
      items: [
        { cmd: "./omni start", label: "start", desc: "Full spectrum scan" },
        { cmd: "./omni stop", label: "stop", desc: "Stop & save" },
        { cmd: "./omni status", label: "status", desc: "All subsystems" },
      ],
    },
    {
      cat: "Wi-Fi",
      items: [
        { cmd: "./omni wifi channel hop", label: "channel hop", desc: "Hop 1–11" },
        { cmd: "./omni wifi channel fixed", label: "channel fixed", desc: "Stay on channel" },
        { cmd: "./omni wifi handshake", label: "handshake", desc: "EAPoL stats" },
        { cmd: "./omni wifi deauth", label: "deauth", desc: "Detected attacks" },
      ],
    },
    {
      cat: "BLE",
      items: [
        { cmd: "./omni ble scan on", label: "scan on", desc: "Onboard ESP32 BLE" },
        { cmd: "./omni ble list", label: "list", desc: "Discovered advertisers" },
        { cmd: "./omni ble filter clear", label: "filter clear", desc: "Clear name filter" },
      ],
    },
    {
      cat: "Sub-GHz",
      items: [
        { cmd: "./omni subghz scan on", label: "scan on", desc: "CC1101 RX" },
        { cmd: "./omni subghz hop", label: "hop", desc: "315→433→868→915" },
        { cmd: "./omni subghz list", label: "list", desc: "Recent packets" },
        { cmd: "./omni subghz raw", label: "raw", desc: "Raw hex + GPS" },
        { cmd: "./omni subghz raw last", label: "raw last", desc: "Newest packet" },
        { cmd: "./omni subghz raw analyze", label: "raw analyze", desc: "Pattern stats" },
        { cmd: "./omni subghz raw save", label: "raw save", desc: "PSRAM .bin export" },
        { cmd: "./omni subghz raw clear", label: "raw clear", desc: "Clear buffer" },
      ],
    },
    {
      cat: "LoRa · Wi-Fi LR",
      items: [
        { cmd: "./omni lora scan on", label: "lora on", desc: "E22 listen" },
        { cmd: "./omni lora list", label: "lora list", desc: "Recent LoRa" },
        { cmd: "./omni lr status", label: "lr status", desc: "ESP Wi-Fi LR + ESP-NOW" },
        { cmd: "./omni lr test", label: "lr test", desc: "Ping LR peer" },
      ],
    },
    {
      cat: "GPS · AP · Log · System",
      items: [
        { cmd: "./omni gps status", label: "gps", desc: "Fix status" },
        { cmd: "./omni ap status", label: "ap", desc: "SoftAP status" },
        { cmd: "./omni log status", label: "log", desc: "Session logging" },
        { cmd: "./omni system info", label: "info", desc: "ESP32-S3 info" },
        { cmd: "./omni system help", label: "help", desc: "All commands" },
      ],
    },
  ];

  let mounted = false;

  function $(id) {
    return document.getElementById(id);
  }

  function baseUrl() {
    const el = $("omniBase") || $("rootBaseKit");
    return (el && el.value.trim()) || "http://192.168.4.1";
  }

  function appendTerm(text, cls) {
    const term = $("omniTerm");
    if (!term) return;
    const line = document.createElement("div");
    line.className = "omni-line" + (cls ? " " + cls : "");
    line.textContent = text;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  function renderCaps() {
    const host = $("omniCaps");
    if (!host) return;
    host.innerHTML = CAPS.map(
      (g) =>
        `<div class="omni-cap-group">
          <h3>${ARIA.esc(g.cat)}</h3>
          <div class="omni-cap-grid">
            ${g.items
              .map(
                (it) =>
                  `<button type="button" class="omni-cap" data-omni-cmd="${ARIA.esc(it.cmd)}" title="${ARIA.esc(it.cmd)}">
                    <span class="omni-cap-label">${ARIA.esc(it.label)}</span>
                    <span class="omni-cap-desc">${ARIA.esc(it.desc)}</span>
                  </button>`
              )
              .join("")}
          </div>
        </div>`
    ).join("");
    host.querySelectorAll("[data-omni-cmd]").forEach((btn) => {
      btn.onclick = () => {
        const cmd = btn.dataset.omniCmd;
        if ($("omniCmd")) $("omniCmd").value = cmd;
        runCmd(cmd);
      };
    });
  }

  async function runCmd(cmd) {
    cmd = (cmd || "").trim();
    if (!cmd) return;
    if (!cmd.startsWith("./omni") && !cmd.startsWith("omni")) {
      cmd = "./omni " + cmd.replace(/^\.\//, "");
    }
    appendTerm("> " + cmd, "omni-in");
    const status = $("omniStatus");
    if (status) {
      status.textContent = "sending…";
      status.className = "kit-status pending";
    }
    try {
      // Prefer structured JSON for raw dumps — Omni text path was blanking on oversized HEX
      const isRaw =
        /^(\.\/)?omni\s+subghz\s+raw\s*$/i.test(cmd) ||
        /^(\.\/)?omni\s+subghz\s+raw\s+\d+\s*$/i.test(cmd);
      if (isRaw) {
        const nMatch = cmd.match(/\bra\w*\s+(\d+)\s*$/i);
        const n = nMatch ? Math.min(50, Math.max(1, parseInt(nMatch[1], 10))) : 20;
        const j = await ARIA.api(
          "/api/root/subghz/raw?n=" + n + "&base=" + encodeURIComponent(baseUrl())
        );
        let text = "";
        if (j && j.ok === false && j.error) {
          text = "ERROR: " + j.error;
        } else if (j && Array.isArray(j.packets)) {
          text =
            "=== SUB-GHZ RAW (JSON) ===\nTotal: " +
            (j.total ?? 0) +
            " · shown: " +
            (j.count ?? j.packets.length) +
            "\n\n";
          if (!j.packets.length) {
            text +=
              "(no raw captures yet)\nPress a 315/433/868 remote near the board, then retry.\n";
          } else {
            j.packets.forEach((pk, i) => {
              text +=
                "[" +
                (i + 1) +
                "] " +
                (pk.mhz ?? "?") +
                " MHz " +
                (pk.rssi ?? "?") +
                " dBm " +
                (pk.len ?? 0) +
                "B\nHEX: " +
                (pk.hex || "(empty)") +
                "\n\n";
            });
          }
        } else {
          text = JSON.stringify(j, null, 2);
        }
        appendTerm(text, "omni-out");
        if (status) {
          status.textContent = "OK";
          status.className = "kit-status ok";
        }
        return;
      }

      const r = await ARIA.api("/api/root/omni", {
        method: "POST",
        body: JSON.stringify({ cmd, base: baseUrl() }),
      });
      let out = r.output;
      if (out == null || out === "") out = r.error || JSON.stringify(r);
      appendTerm(String(out), r.ok === false ? "omni-err" : "omni-out");
      if (status) {
        status.textContent = r.ok === false ? "ERROR" : "OK";
        status.className = "kit-status " + (r.ok === false ? "err" : "ok");
      }
    } catch (e) {
      appendTerm(String(e.message || e), "omni-err");
      if (status) {
        status.textContent = "unreachable";
        status.className = "kit-status err";
      }
      ARIA.toast("Root OmniScan unreachable — join root Wi‑Fi", true);
    }
  }

  function mount() {
    if (mounted) {
      ping();
      return;
    }
    mounted = true;
    renderCaps();
    $("omniRun").onclick = () => runCmd($("omniCmd").value);
    $("omniCmd").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runCmd($("omniCmd").value);
      }
    });
    $("omniClear").onclick = () => {
      const term = $("omniTerm");
      if (term) term.innerHTML = "";
    };
    $("btnOmniPing").onclick = ping;
    $("omniQuickStart").onclick = () => runCmd("./omni start");
    $("omniQuickStatus").onclick = () => runCmd("./omni status");
    $("omniQuickRaw").onclick = () => runCmd("./omni subghz raw");
    $("omniQuickHelp").onclick = () => runCmd("./omni system help");
    appendTerm("OmniScan console ready — commands go to root via /api/omni", "omni-meta");
    ping();
  }

  async function ping() {
    const chip = $("omniStatus");
    try {
      const r = await ARIA.api("/api/root/ping?base=" + encodeURIComponent(baseUrl()));
      if (chip) {
        chip.textContent = r.ok ? "Root online" : r.error || "Unreachable";
        chip.className = "kit-status " + (r.ok ? "ok" : "err");
      }
    } catch (e) {
      if (chip) {
        chip.textContent = "Join root Wi‑Fi";
        chip.className = "kit-status err";
      }
    }
  }

  return { mount, runCmd, ping };
})();
