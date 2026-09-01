/* Laptop GPS — fast coarse-first, then refine; never block on Root push */
window.ARIAGPS = (function () {
  let watchId = null;
  let lastFix = null;
  let config = { pushRoot: false, rootBase: null, onFix: null, onLocated: null };
  let chipTimer = null;
  let locating = false;

  function supported() {
    return typeof navigator !== "undefined" && !!navigator.geolocation;
  }

  function configure(opts) {
    if (!opts) return config;
    config = { ...config, ...opts };
    return config;
  }

  function geoError(err) {
    if (!err) return "Geolocation failed";
    if (err.code === 1) return "Location blocked — allow location for this site";
    if (err.code === 2) return "Position unavailable — turn on Windows location services";
    if (err.code === 3) return "Location timed out — Wi‑Fi positioning may still work; try again";
    return err.message || String(err);
  }

  function tryPosition(options) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function postToAria(fix) {
    return ARIA.api("/api/gps", {
      method: "POST",
      body: JSON.stringify({
        lat: fix.lat,
        lng: fix.lng,
        lon: fix.lng,
        alt: fix.alt || 0,
        accuracy: fix.accuracy,
        source: "browser",
        ts: Date.now() / 1000,
      }),
    });
  }

  function pushToRoot(fix, base) {
    const b = (base || resolveRootBase()).trim();
    return ARIA.api("/api/root/gps?base=" + encodeURIComponent(b), {
      method: "POST",
      body: JSON.stringify({
        lat: fix.lat,
        lng: fix.lng,
        lon: fix.lng,
        alt: fix.alt || 0,
        accuracy: fix.accuracy,
      }),
    });
  }

  function fromPosition(pos) {
    const c = pos.coords;
    return {
      lat: c.latitude,
      lng: c.longitude,
      alt: c.altitude || 0,
      accuracy: c.accuracy,
      source: "browser",
      ts: Date.now() / 1000,
      valid: true,
    };
  }

  function resolveRootBase(opts) {
    opts = opts || config;
    const el = document.getElementById("rootBase");
    if (el && el.value) return el.value.trim();
    if (opts && typeof opts.rootBase === "function") return opts.rootBase();
    if (opts && opts.rootBase) return opts.rootBase;
    return "http://192.168.4.1";
  }

  function shouldPushRoot(btn) {
    if (btn && btn.dataset.gpsRoot !== undefined) return true;
    if (config.pushRoot) return true;
    return !!document.body.dataset.gpsRoot;
  }

  async function applyFix(fix, opts) {
    opts = opts || {};
    lastFix = fix;
    refreshChip(fix);
    postToAria(fix).catch((e) => console.warn("ARIA GPS store failed", e));
    if (opts.pushRoot) {
      pushToRoot(fix, resolveRootBase(opts)).catch(() => {});
    }
    if (typeof config.onFix === "function") config.onFix(fix);
    if (typeof opts.onFix === "function") opts.onFix(fix);
    return fix;
  }

  async function locateOnce(opts) {
    opts = opts || {};
    if (!supported()) throw new Error("Geolocation not available in this browser");

    if (lastFix && lastFix.valid && Date.now() / 1000 - (lastFix.ts || 0) < 120) {
      const fix = await applyFix(lastFix, opts);
      if (typeof config.onLocated === "function") config.onLocated(fix);
      if (typeof opts.onLocated === "function") opts.onLocated(fix);
      return fix;
    }

    const phases = [
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 2500 },
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 5000 },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    ];
    let lastErr = null;
    for (const phase of phases) {
      try {
        const pos = await tryPosition(phase);
        const fix = await applyFix(fromPosition(pos), opts);
        if (typeof config.onLocated === "function") config.onLocated(fix);
        if (typeof opts.onLocated === "function") opts.onLocated(fix);
        return fix;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(geoError(lastErr));
  }

  async function warm(opts) {
    if (locating || !supported()) return lastFix;
    locating = true;
    try {
      return await locateOnce(opts || { pushRoot: false });
    } catch (e) {
      return null;
    } finally {
      locating = false;
    }
  }

  function startWatch(opts) {
    opts = opts || {};
    if (!supported()) return null;
    stopWatch();
    const pushRoot = opts.pushRoot != null ? opts.pushRoot : config.pushRoot;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        applyFix(fromPosition(pos), { pushRoot }).catch(() => {});
      },
      (err) => console.warn("GPS watch", geoError(err)),
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 12000 }
    );
    return watchId;
  }

  function stopWatch() {
    if (watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
  }

  async function getBest() {
    if (lastFix && lastFix.valid) return lastFix;
    try {
      const remote = await ARIA.api("/api/gps");
      if (remote && remote.valid) {
        lastFix = remote;
        refreshChip(remote);
        return remote;
      }
    } catch (e) {}
    return lastFix;
  }

  async function applyToEngagement(opts) {
    opts = opts || {};
    let fix = lastFix;
    if (!fix || !fix.valid) {
      fix = await locateOnce({ pushRoot: opts.pushRoot });
    }
    const id = ARIA.getActiveId();
    if (!id) {
      const modal = ARIA.$("#engModal");
      if (modal) modal.showModal();
      throw new Error("No active engagement");
    }
    const eng = await ARIA.api("/api/engagements/" + id + "/locus", {
      method: "PATCH",
      body: JSON.stringify({
        lat: fix.lat,
        lng: fix.lng || fix.lon,
        label: opts.label || "Laptop GPS",
        gps: true,
      }),
    });
    ARIA.toast("Engagement locus set from laptop GPS");
    if (typeof opts.onApplied === "function") opts.onApplied(eng, fix);
    return eng;
  }

  function fillForm(form) {
    if (!form || !lastFix) return false;
    const lat = form.querySelector('[name="lat"]');
    const lng = form.querySelector('[name="lng"]');
    const label = form.querySelector('[name="locus_label"]');
    if (lat) lat.value = Number(lastFix.lat).toFixed(6);
    if (lng) lng.value = Number(lastFix.lng || lastFix.lon).toFixed(6);
    if (label && (!label.value || label.value === "Engagement locus")) {
      label.value = "Laptop GPS";
    }
    const hint = form.querySelector("#gpsHint");
    if (hint) {
      hint.textContent = "Locus: " + Number(lastFix.lat).toFixed(5) + ", " + Number(lastFix.lng || lastFix.lon).toFixed(5);
      hint.style.color = "var(--accent)";
    }
    return true;
  }

  function formatChip(fix) {
    if (!fix || fix.valid === false) return { cls: "off", text: "GPS off" };
    const acc = fix.accuracy ? " ±" + Math.round(fix.accuracy) + "m" : "";
    const stale = fix.stale ? " (stale)" : "";
    return {
      cls: fix.stale ? "stale" : "on",
      text:
        Number(fix.lat).toFixed(4) +
        ", " +
        Number(fix.lng || fix.lon).toFixed(4) +
        acc +
        stale,
    };
  }

  function refreshChip(fix) {
    const chip = document.getElementById("navGps");
    if (!chip) return;
    const f = fix || lastFix;
    const { cls, text } = formatChip(f && f.valid !== false ? f : null);
    chip.className = "gps-chip " + cls;
    const dot = chip.querySelector(".dot");
    const txt = chip.querySelector(".txt");
    if (dot) dot.className = "dot " + cls;
    if (txt) txt.textContent = text;
  }

  function mountChip() {
    if (document.getElementById("navGps")) return;
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const foot = nav.querySelector(".nav-foot");
    const html =
      '<div class="gps-chip off" id="navGps" title="Click to refresh laptop GPS">' +
      '<span class="dot off"></span><span class="txt">GPS off</span></div>';
    if (foot) foot.insertAdjacentHTML("beforebegin", html);
    else nav.insertAdjacentHTML("beforeend", html);
    const chip = document.getElementById("navGps");
    if (chip) {
      chip.style.cursor = "pointer";
      chip.addEventListener("click", () => {
        ARIA.toast("Locating…");
        locateOnce({ pushRoot: false })
          .then((f) => ARIA.toast("GPS " + Number(f.lat).toFixed(5) + ", " + Number(f.lng).toFixed(5)))
          .catch((e) => ARIA.toast(e.message, true));
      });
    }
  }

  function bind(opts) {
    configure(opts);
    mountChip();
    getBest().catch(() => {});
    warm({ pushRoot: false });
    if (chipTimer) clearInterval(chipTimer);
    chipTimer = setInterval(() => getBest().catch(() => {}), 30000);
  }

  function boot() {
    if (window.__ariaGpsClick) return;
    if (!window.ARIA) {
      setTimeout(boot, 50);
      return;
    }
    window.__ariaGpsClick = true;
    mountChip();

    document.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-gps-locate],[data-gps-apply-eng]");
      if (!btn) return;
      e.preventDefault();
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = btn.matches("[data-gps-apply-eng]") ? "Applying…" : "Locating…";
      try {
        if (btn.matches("[data-gps-apply-eng]")) {
          const eng = await applyToEngagement({
            pushRoot: shouldPushRoot(btn),
            onApplied: config.onApplied,
          });
          if (typeof config.onLocated === "function" && lastFix) config.onLocated(lastFix);
          if (typeof config.onEngagementLocus === "function") config.onEngagementLocus(eng);
          return;
        }
        const fix = await locateOnce({
          pushRoot: shouldPushRoot(btn),
          onLocated: config.onLocated,
        });
        fillForm(document.getElementById("newEngForm"));
        ARIA.toast(
          "GPS " +
            Number(fix.lat).toFixed(5) +
            ", " +
            Number(fix.lng).toFixed(5) +
            (fix.accuracy ? " ±" + Math.round(fix.accuracy) + "m" : "")
        );
      } catch (err) {
        ARIA.toast(String(err.message || err), true);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });

    if (document.body.dataset.gpsWatch !== undefined) {
      startWatch({ pushRoot: document.body.dataset.gpsRoot !== undefined });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  return {
    supported,
    configure,
    locateOnce,
    warm,
    startWatch,
    stopWatch,
    getBest,
    applyToEngagement,
    last: () => lastFix,
    fillForm,
    bind,
    pushToRoot,
    refreshChip,
    mountChip,
  };
})();
