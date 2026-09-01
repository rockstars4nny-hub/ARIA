/* ARIA radar — ported from Root ci_dashboard.h signal range map */
window.ARIARadar = (function () {
  let canvas, ctx, radarStage, radarTip;
  let radarW = 300, radarH = 300, dpr = 1;
  let paused = false, frozenSweep = 0;
  let devices = [];
  let searchQ = "";
  let activeFilters = new Set();
  let selectedId = null;
  let hitList = [];
  let onSelect = null;

  function init(opts) {
    canvas = document.getElementById("radar");
    ctx = canvas.getContext("2d");
    radarStage = document.getElementById("radarStage");
    radarTip = document.getElementById("radarTip");
    onSelect = opts && opts.onSelect;

    if (radarStage && window.ResizeObserver) {
      new ResizeObserver(fit).observe(radarStage);
    }
    window.addEventListener("resize", fit);
    setTimeout(fit, 50);
    setTimeout(fit, 300);
    setTimeout(fit, 800);

    canvas.addEventListener("pointerdown", onPointer, { passive: false });

    document.getElementById("search").addEventListener("input", (e) => {
      searchQ = e.target.value || "";
      renderList();
    });
    document.getElementById("filters").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const f = chip.dataset.f;
      if (f === "clear") {
        activeFilters.clear();
      } else {
        if (activeFilters.has(f)) activeFilters.delete(f);
        else activeFilters.add(f);
      }
      document.querySelectorAll(".chip[data-f]").forEach((c) => {
        if (c.dataset.f === "clear") return;
        c.classList.toggle("on", activeFilters.has(c.dataset.f));
      });
      renderList();
      updateChipCounts();
    });

    requestAnimationFrame(paint);
  }

  function fit() {
    if (!radarStage || !canvas) return;
    const rect = radarStage.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    radarW = Math.floor(rect.width);
    radarH = Math.floor(rect.height);
    canvas.width = Math.floor(radarW * dpr);
    canvas.height = Math.floor(radarH * dpr);
    canvas.style.width = radarW + "px";
    canvas.style.height = radarH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setPaused(on) {
    paused = !!on;
    const el = document.getElementById("radarPaused");
    if (el) el.classList.toggle("show", paused);
    const btn = document.getElementById("btnPause");
    if (btn) {
      btn.textContent = paused ? "Resume" : "Pause";
      btn.classList.toggle("paused", paused);
    }
    if (paused) frozenSweep = ((performance.now() / 1000) % 3) / 3;
  }

  function togglePause() {
    setPaused(!paused);
  }

  function setDevices(list) {
    devices = Array.isArray(list) ? list : [];
    updateChipCounts();
    renderList();
    const meta = document.getElementById("radarMeta");
    if (meta) meta.textContent = devices.length ? devices.length + " tracks" : "listening";
  }

  function hay(d) {
    return [d.name, d.mac, d.ssid, d.kind, d.band, d.zone, d.source, d.label]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function matches(d) {
    const q = searchQ.trim().toLowerCase();
    if (q && !hay(d).includes(q)) return false;
    if (!activeFilters.size) return true;
    if (activeFilters.has("root") && d.origin !== "root") return false;
    if (activeFilters.has("pin") && d.origin !== "pin") return false;
    if (activeFilters.has("wifi") && (d.band || "") !== "wifi") return false;
    if (activeFilters.has("ble") && (d.band || "") !== "ble") return false;
    if (activeFilters.has("subghz") && (d.band || "") !== "subghz") return false;
    if (activeFilters.has("Near") && (d.zone || "") !== "Near") return false;
    if (activeFilters.has("Mid") && (d.zone || "") !== "Mid") return false;
    if (activeFilters.has("Far") && (d.zone || "") !== "Far") return false;
    if (activeFilters.has("fresh") && (d.last_seen_ms || 99999) >= 30000) return false;
    return true;
  }

  function visible() {
    return devices.filter(matches);
  }

  function countFor(f) {
    const set = new Set([f]);
    return devices.filter((d) => {
      const q = "";
      const af = set;
      if (af.has("root") && d.origin !== "root") return false;
      if (af.has("pin") && d.origin !== "pin") return false;
      if (af.has("wifi") && (d.band || "") !== "wifi") return false;
      if (af.has("ble") && (d.band || "") !== "ble") return false;
      if (af.has("subghz") && (d.band || "") !== "subghz") return false;
      if (af.has("Near") && d.zone !== "Near") return false;
      if (af.has("Mid") && d.zone !== "Mid") return false;
      if (af.has("Far") && d.zone !== "Far") return false;
      if (af.has("fresh") && (d.last_seen_ms || 99999) >= 30000) return false;
      return true;
    }).length;
  }

  function updateChipCounts() {
    document.querySelectorAll(".chip[data-f]").forEach((chip) => {
      const f = chip.dataset.f;
      if (!f || f === "clear") return;
      const n = countFor(f);
      if (n > 0) chip.setAttribute("data-count", String(n));
      else chip.removeAttribute("data-count");
    });
  }

  function renderList() {
    const rows = visible().sort(
      (a, b) => (a.distance_m || 99) - (b.distance_m || 99)
    );
    const empty = document.getElementById("empty");
    const cards = document.getElementById("devCards");
    const head = document.getElementById("listHead");
    if (head) {
      head.textContent =
        rows.length +
        " visible · " +
        devices.length +
        " total · search / filter like Root";
    }
    if (!rows.length) {
      empty.style.display = "block";
      cards.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    cards.innerHTML = rows
      .map((d) => {
        const id = d.id || d.mac;
        const sel = id === selectedId ? " sel" : "";
        const origin = d.origin === "root" ? " root" : " pin";
        const tags = [
          d.band || d.source || "?",
          d.kind || "",
          d.rssi != null ? Number(d.rssi).toFixed(0) + " dBm" : "",
          d.zone || "",
        ]
          .filter(Boolean)
          .map((t) => '<span class="tag">' + esc(t) + "</span>")
          .join("");
        return (
          '<div class="dev-card' +
          sel +
          origin +
          '" data-id="' +
          esc(id) +
          '">' +
          '<div class="dev-top"><div class="dev-name">' +
          esc(d.name || d.label || d.mac || "device") +
          '</div><div class="dev-dist">~' +
          Number(d.distance_m || 0).toFixed(1) +
          "m</div></div>" +
          '<div class="dev-mac">' +
          esc(d.mac || d.id || "") +
          "</div>" +
          '<div class="dev-tags">' +
          tags +
          "</div>" +
          '<div class="dev-summary">' +
          esc(d.summary || d.origin || "") +
          "</div></div>"
        );
      })
      .join("");

    cards.querySelectorAll(".dev-card").forEach((el) => {
      el.onclick = () => select(el.dataset.id);
    });
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function select(id) {
    selectedId = id || null;
    const d = devices.find((x) => (x.id || x.mac) === selectedId);
    showTip(d || null);
    renderList();
    if (typeof onSelect === "function" && d) onSelect(d);
  }

  function showTip(d) {
    if (!d) {
      radarTip.classList.remove("show");
      radarTip.innerHTML = "";
      return;
    }
    radarTip.innerHTML =
      "<b>" +
      esc(d.name || d.label || "track") +
      "</b>" +
      "<div class='sub'>" +
      esc(d.summary || d.origin || "") +
      "</div>" +
      "<div class='sub' style='margin-top:6px'>" +
      esc(d.mac || d.id || "") +
      " · " +
      (d.rssi != null ? Number(d.rssi).toFixed(0) + " dBm · " : "") +
      "~" +
      Number(d.distance_m || 0).toFixed(1) +
      "m · " +
      esc(d.zone || "?") +
      "</div>";
    radarTip.classList.add("show");
  }

  function macHash(mac) {
    let h = 2166136261;
    for (let i = 0; i < (mac || "").length; i++) {
      h ^= mac.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function maxRingMeters() {
    let far = 12;
    for (const d of devices) {
      const m = Number(d.distance_m);
      if (Number.isFinite(m) && m > far) far = m;
    }
    return Math.min(Math.max(far * 1.15, 12), 80);
  }

  function radarLayout(list, maxM) {
    const buckets = [[], [], [], []];
    for (const d of list) {
      const m = Number(d.distance_m || 25);
      let b = 3;
      if (m < maxM * 0.25) b = 0;
      else if (m < maxM * 0.5) b = 1;
      else if (m < maxM * 0.75) b = 2;
      buckets[b].push(d);
    }
    const layout = new Map();
    for (let bi = 0; bi < 4; bi++) {
      const bucket = buckets[bi].sort((a, b) =>
        String(a.id || a.mac).localeCompare(String(b.id || b.mac))
      );
      const n = bucket.length;
      for (let i = 0; i < n; i++) {
        const d = bucket[i];
        const key = d.id || d.mac;
        const baseAng = n <= 1 ? -Math.PI / 2 : (i / n) * Math.PI * 2 - Math.PI / 2;
        const jitter = ((macHash(key) % 1000) / 1000 - 0.5) * 0.22;
        layout.set(key, { ang: baseAng + jitter });
      }
    }
    return layout;
  }

  function distR(meters, maxR, maxM) {
    const t = Math.min(Math.max((Number(meters) || 40) / Math.max(maxM, 1), 0.02), 1);
    return 14 + t * (maxR - 18);
  }

  function bandColor(d) {
    if (d.origin === "pin") {
      if (d.source === "web3") return "#d47a3a";
      if (d.source === "seed" || d.source === "osint") return "#6ba3ff";
      if (d.source === "glass") return "#3ee8c5";
      return "#c4a35a";
    }
    if (d.band === "lora") return "#c084fc";
    if (d.band === "subghz") return "#fb923c";
    if (d.band === "ble") return "#6ba3ff";
    return "#3ee8c5";
  }

  function onPointer(ev) {
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (e) {}
    const rect = canvas.getBoundingClientRect();
    const t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    const pt = {
      x: (t.clientX - rect.left) * (radarW / Math.max(rect.width, 1)),
      y: (t.clientY - rect.top) * (radarH / Math.max(rect.height, 1)),
    };
    let best = null,
      bestD = 28;
    for (const h of hitList) {
      const dd = Math.hypot(pt.x - h.x, pt.y - h.y);
      if (dd < bestD) {
        bestD = dd;
        best = h.id;
      }
    }
    select(best === selectedId ? null : best);
    if (ev.cancelable) ev.preventDefault();
  }

  function paint() {
    try {
      const w = radarW,
        h = radarH;
      if (w < 40 || h < 40) {
        requestAnimationFrame(paint);
        return;
      }
      const cx = w / 2,
        cy = h / 2,
        maxR = Math.max(36, Math.min(cx, cy) - 16);
      const maxM = maxRingMeters();
      const now = performance.now();
      const sweepT = paused ? frozenSweep : ((now / 1000) % 3) / 3;
      if (!paused) frozenSweep = sweepT;
      const sweepAng = sweepT * Math.PI * 2;

      ctx.fillStyle = "#0d0d0d";
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(62,232,197,0.22)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        const rr = maxR * (i / 4);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "10px ui-monospace,Menlo,Consolas,monospace";
        ctx.fillText(Math.round(maxM * (i / 4)) + "m", cx + 4, cy - rr + 11);
      }
      ctx.strokeStyle = "rgba(62,232,197,0.12)";
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      const wedge = 0.35;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAng - wedge, sweepAng, false);
      ctx.closePath();
      ctx.fillStyle = "rgba(62,232,197,0.10)";
      ctx.fill();
      const lx = cx + Math.cos(sweepAng) * maxR,
        ly = cy + Math.sin(sweepAng) * maxR;
      ctx.strokeStyle = "rgba(62,232,197,0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.strokeStyle = "rgba(62,232,197,0.18)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(lx, ly);
      ctx.stroke();

      const vis = visible();
      const layout = radarLayout(vis, maxM);
      hitList = [];
      for (const d of vis) {
        const id = d.id || d.mac;
        const lay = layout.get(id) || { ang: -Math.PI / 2 };
        const r = distR(d.distance_m, maxR, maxM);
        const x = cx + Math.cos(lay.ang) * r,
          y = cy + Math.sin(lay.ang) * r;
        hitList.push({ id, x, y });
        const ageMs = d.last_seen_ms || 99999;
        const fresh = ageMs < 2500;
        const recent = ageMs < 15000;
        let col = bandColor(d);
        if ((d.distance_m || 99) < 2) col = "#3ee8c5";
        else if ((d.distance_m || 99) < 8 && d.origin === "root") col = "#fb923c";
        ctx.save();
        const sel = id === selectedId;
        const sz = sel ? 6 : 3.5;
        ctx.globalAlpha = recent ? 1 : 0.42;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, sz, 0, Math.PI * 2);
        ctx.fill();
        if (fresh) {
          const pulse = 0.45 + 0.35 * Math.sin(now * 0.009);
          ctx.shadowColor = col;
          ctx.shadowBlur = 8 + pulse * 6;
          ctx.strokeStyle = col;
          ctx.globalAlpha = pulse;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, sz + 3 + pulse * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        if (sel) {
          ctx.strokeStyle = "#3ee8c5";
          ctx.globalAlpha = 0.95;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, sz + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.fillStyle = "#3ee8c5";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 9px ui-monospace,Menlo,Consolas,monospace";
      ctx.textAlign = "center";
      ctx.fillText("YOU", cx, cy + 16);
      ctx.textAlign = "start";
      ctx.strokeStyle = "rgba(62,232,197,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.stroke();
    } catch (e) {}
    requestAnimationFrame(paint);
  }

  /** Haversine km → approximate radar meters scaled for display */
  function geoDistanceM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(lat2 - lat1);
    const dLng = toR(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function pinsToDevices(pins, declared) {
    const dLat = declared && declared.lat;
    const dLng = declared && declared.lng;
    return (pins || []).map((p, i) => {
      let dist = 8 + (i % 5) * 4;
      let zone = "Mid";
      if (dLat != null && p.lat != null) {
        const meters = geoDistanceM(dLat, dLng, p.lat, p.lng);
        // compress geo meters into radar scale (cap 80m ring)
        dist = Math.min(75, Math.max(2, Math.sqrt(meters) * 0.15));
        zone = dist < 5 ? "Near" : dist < 20 ? "Mid" : "Far";
      }
      return {
        id: p.id || "pin-" + i,
        mac: p.id || "pin-" + i,
        name: p.label || p.source,
        label: p.label,
        origin: "pin",
        source: p.source,
        kind: p.kind || "pin",
        band: p.source === "glass" ? "wifi" : "pin",
        distance_m: dist,
        zone,
        rssi: null,
        last_seen_ms: 1000,
        summary: (p.meta && (p.meta.note || p.meta.org || p.meta.city)) || p.source,
        lat: p.lat,
        lng: p.lng,
      };
    });
  }

  function rootToDevices(payload) {
    const list = (payload && payload.devices) || payload || [];
    return (Array.isArray(list) ? list : []).map((d) => ({
      id: d.mac,
      mac: d.mac,
      name: d.ssid || d.vendor || d.mac,
      origin: "root",
      source: "root",
      kind: d.kind || "wifi",
      band: d.band || "wifi",
      distance_m: Number(d.distance_m || 20),
      zone: d.zone || "Far",
      rssi: d.avg != null ? d.avg : d.rssi,
      last_seen_ms: d.last_seen_ms != null ? d.last_seen_ms : 5000,
      summary: (d.band || "wifi") + " · " + (d.kind || "device"),
      raw: d,
    }));
  }

  return {
    init,
    setDevices,
    setPaused,
    togglePause,
    fit,
    pinsToDevices,
    rootToDevices,
    merge: function (rootDevs, pinDevs) {
      setDevices([].concat(rootDevs || [], pinDevs || []));
    },
  };
})();
