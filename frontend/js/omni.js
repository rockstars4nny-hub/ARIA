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
        { cmd: "./omni ap start", label: "ap start", desc: "Bring SoftAP up if down" },
        { cmd: "./omni ap restart", label: "ap restart", desc: "Force SoftAP re-beacon" },
        { cmd: "./omni log status", label: "log", desc: "Session logging" },
        { cmd: "./omni system info", label: "info", desc: "ESP32-S3 info" },
        { cmd: "./omni system help", label: "help", desc: "All commands" },
      ],
    },
  ];

  let mounted = false;
  /** @type {{ ts: string, cls: string, text: string }[]} */
  let transcript = [];
  let savedCount = 0; // lines already flushed to engagement (append mode)

  function $(id) {
    return document.getElementById(id);
  }

  function baseUrl() {
    const el = $("omniBase") || $("rootBaseKit");
    return (el && el.value.trim()) || "http://192.168.4.1";
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function appendTerm(text, cls) {
    const term = $("omniTerm");
    if (!term) return;
    const line = document.createElement("div");
    line.className = "omni-line" + (cls ? " " + cls : "");
    line.textContent = text;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
    transcript.push({
      ts: isoNow(),
      cls: cls || "omni-out",
      text: String(text ?? ""),
    });
  }

  function getTranscript() {
    return transcript.slice();
  }

  function transcriptText() {
    return transcript.map((e) => e.text).join("\n");
  }

  function downloadBlob(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function exportLocal() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const eid = (typeof ARIA !== "undefined" && ARIA.getActiveId && ARIA.getActiveId()) || "none";
    const pack = {
      product: "ARIA OmniScan",
      export_type: "omni_console",
      exported_at: isoNow(),
      engagement_id: eid,
      line_count: transcript.length,
      omni_log: transcript.slice(),
      omni_output: transcriptText(),
    };
    downloadBlob(
      "ARIA_omni_" + stamp + ".json",
      new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" })
    );
    downloadBlob(
      "ARIA_omni_" + stamp + ".txt",
      new Blob([pack.omni_output || "(empty)"], { type: "text/plain" })
    );
    ARIA.toast("Omni output exported (" + transcript.length + " lines)");
    return pack;
  }

  /**
   * Push transcript into the active engagement so Export JSON includes it.
   * @param {string} [eid]
   * @param {{ replace?: boolean, onlyNew?: boolean }} [opts]
   */
  async function flushToEngagement(eid, opts) {
    opts = opts || {};
    const id =
      eid ||
      (typeof ARIA !== "undefined" && ARIA.getActiveId && ARIA.getActiveId());
    if (!id) {
      ARIA.toast("No active engagement — set one on Engagements tab", true);
      return null;
    }
    let entries = transcript;
    if (opts.onlyNew && savedCount > 0) {
      entries = transcript.slice(savedCount);
    }
    if (!entries.length && !opts.replace) {
      return { ok: true, omni_line_count: 0, skipped: true };
    }
    const r = await ARIA.api("/api/engagements/" + id + "/omni", {
      method: "POST",
      body: JSON.stringify({
        entries,
        replace: !!opts.replace,
      }),
    });
    if (!opts.replace) savedCount = transcript.length;
    else savedCount = transcript.length;
    return r;
  }

  async function saveToEngagement() {
    try {
      const r = await flushToEngagement(undefined, { onlyNew: true });
      if (!r) return;
      if (r.skipped) {
        ARIA.toast("Nothing new to save");
        return;
      }
      ARIA.toast(
        "Omni saved to engagement (" + (r.omni_line_count ?? "?") + " total lines)"
      );
    } catch (e) {
      ARIA.toast(String(e.message || e), true);
    }
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
      // Prefer structured JSON when ARIA has /api/root/subghz/raw; else ./omni via proxy.
      const isRawList =
        /^(\.\/)?omni\s+subghz\s+raw\s*$/i.test(cmd) ||
        /^(\.\/)?omni\s+subghz\s+raw\s+\d+\s*$/i.test(cmd);
      if (isRawList) {
        const nMatch = cmd.match(/\braw\s+(\d+)\s*$/i);
        const n = nMatch ? Math.min(50, Math.max(1, parseInt(nMatch[1], 10))) : 20;
        try {
          const j = await ARIA.api(
            "/api/root/subghz/raw?n=" + n + "&base=" + encodeURIComponent(baseUrl())
          );
          let text = "";
          if (j && Array.isArray(j.packets)) {
            text =
              "=== SUB-GHZ RAW ===\nTotal: " +
              (j.total ?? 0) +
              " · shown: " +
              (j.count ?? j.packets.length) +
              "\n\n";
            if (!j.packets.length) {
              text +=
                "(no raw captures yet)\nPress a 315/433/868/915 remote near the board, then retry.\n";
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
            appendTerm(text, "omni-out");
            if (status) {
              status.textContent = "OK";
              status.className = "kit-status ok";
            }
            return;
          }
        } catch (e1) {
          // Old ARIA process without /subghz/raw → fall through to ./omni
          appendTerm("(JSON raw endpoint missing — using ./omni proxy)\n", "omni-meta");
        }
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
      ARIA.toast("Root OmniScan unreachable — join SoftAP root / root-radar", true);
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
      transcript = [];
      savedCount = 0;
    };
    const expBtn = $("omniExport");
    if (expBtn) expBtn.onclick = () => exportLocal();
    const saveBtn = $("omniSaveEng");
    if (saveBtn) saveBtn.onclick = () => saveToEngagement();
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

  return {
    mount,
    runCmd,
    ping,
    getTranscript,
    exportLocal,
    flushToEngagement,
    saveToEngagement,
  };
})();
