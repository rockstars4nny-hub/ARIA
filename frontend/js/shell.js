/* Shared shell, API, engagement session */
window.ARIA = (function () {
  const ENG_KEY = "aria_active_engagement_id";
  const LOCUS_KEY = "aria_last_locus";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function toast(msg, err) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle("err", !!err);
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(opts && opts.headers) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const d = data.detail;
      throw new Error(
        typeof d === "string"
          ? d
          : Array.isArray(d)
            ? d.map((x) => x.msg || JSON.stringify(x)).join("; ")
            : res.statusText || "request failed"
      );
    }
    return data;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function navHtml(active) {
    const items = [
      ["/", "◆", "Command", "home"],
      ["/", null, "OPERATE", "sec"],
      ["/globe", "◎", "Globe", "globe"],
      ["/radar", "◉", "Radar", "radar"],
      ["/engagements", "▣", "Engagements", "engagements"],
      ["/", null, "DOMAINS", "sec"],
      ["/domains/seed", "S", "Seed / Identity", "seed"],
      ["/domains/osint", "O", "OSINT", "osint"],
      ["/domains/glass", "G", "Glass / Camera", "glass"],
      ["/domains/web3", "W", "Web3 / Chain", "web3"],
      ["/domains/rf", "R", "RF / Root kit", "rf"],
    ];
    let html =
      '<aside class="nav"><div class="nav-brand"><div class="nav-mark">AR</div><div><div class="nav-title">ARIA</div><div class="nav-sub">Recon Agent</div></div></div>';
    for (const [href, ico, label, key] of items) {
      if (key === "sec") {
        html += `<div class="nav-section">${label}</div>`;
        continue;
      }
      const on = active === key ? " active" : "";
      html += `<a class="item${on}" href="${href}"><span class="ico">${ico}</span><span class="label">${label}</span></a>`;
    }
    html +=
      '<div class="nav-foot">MapLibre + OpenFreeMap<br/>No Cesium Ion · No API key wall<br/>Not Finch</div></aside>';
    return html;
  }

  function mountShell(active) {
    const root = document.getElementById("app");
    if (!root) return;
    if (!root.querySelector(".nav")) {
      root.insertAdjacentHTML("afterbegin", navHtml(active));
    }
    if (window.ARIAGPS) ARIAGPS.mountChip();
  }

  function getActiveId() {
    try {
      return localStorage.getItem(ENG_KEY) || "";
    } catch {
      return "";
    }
  }

  function setActiveId(id) {
    try {
      if (id) localStorage.setItem(ENG_KEY, id);
      else localStorage.removeItem(ENG_KEY);
    } catch {}
  }

  function saveLastLocus(locus) {
    try {
      localStorage.setItem(LOCUS_KEY, JSON.stringify(locus));
    } catch {}
  }

  function loadLastLocus() {
    try {
      const raw = localStorage.getItem(LOCUS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function resolveLocus(preferGps) {
    if (window.ARIAGPS) {
      const cached = ARIAGPS.last();
      if (cached && cached.valid) {
        return {
          lat: cached.lat,
          lng: cached.lng || cached.lon,
          label: "Laptop GPS",
          gps: true,
        };
      }
      try {
        const remote = await ARIAGPS.getBest();
        if (remote && remote.valid) {
          return {
            lat: remote.lat,
            lng: remote.lng || remote.lon,
            label: remote.source === "gpsd" ? "gpsd" : "Laptop GPS",
            gps: true,
          };
        }
      } catch (e) {}
      if (preferGps && ARIAGPS.supported()) {
        try {
          const fix = await ARIAGPS.locateOnce({ pushRoot: false });
          return {
            lat: fix.lat,
            lng: fix.lng || fix.lon,
            label: "Laptop GPS",
            gps: true,
          };
        } catch (e) {}
      }
    }
    const last = loadLastLocus();
    if (last && last.lat != null && last.lng != null) return last;
    return { lat: 39.3626, lng: -76.5688, label: "Default locus", gps: false };
  }

  async function loadActive() {
    const id = getActiveId();
    if (!id) return null;
    try {
      return await api("/api/engagements/" + id);
    } catch {
      setActiveId("");
      return null;
    }
  }

  async function createEngagement(body) {
    const eng = await api("/api/engagements", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setActiveId(eng.id);
    if (body.declared_locus) saveLastLocus(body.declared_locus);
    return eng;
  }

  async function quickStartEngagement(title) {
    const locus = await resolveLocus(true);
    const eng = await createEngagement({
      title: (title || "").trim() || "Field op",
      roe: "",
      operator: "operator",
      declared_locus: locus,
    });
    toast("Engagement ready — " + eng.title);
    if (typeof window.onEngagementCreated === "function") {
      window.onEngagementCreated(eng);
    }
    return eng;
  }

  async function deleteEngagement(eid, opts) {
    opts = opts || {};
    const label = opts.label || eid;
    if (
      !opts.skipConfirm &&
      !confirm("Delete engagement \"" + label + "\"?\n\nThis removes pins, findings, and audit data permanently.")
    ) {
      return false;
    }
    await api("/api/engagements/" + encodeURIComponent(eid), { method: "DELETE" });
    if (getActiveId() === eid) setActiveId("");
    toast("Engagement deleted");
    if (typeof window.onEngagementDeleted === "function") window.onEngagementDeleted(eid);
    return true;
  }

  async function clearAudit(eid, opts) {
    opts = opts || {};
    const label = opts.label || eid;
    if (
      !opts.skipConfirm &&
      !confirm("Clear audit trail for \"" + label + "\"?\n\nPins, findings, and action log will be removed. Engagement shell stays.")
    ) {
      return null;
    }
    const data = await api("/api/engagements/" + encodeURIComponent(eid) + "/audit", {
      method: "DELETE",
    });
    toast("Audit cleared");
    if (typeof window.onAuditCleared === "function") window.onAuditCleared(data.engagement);
    return data.engagement;
  }

  function bindEngagementModal() {
    const modal = $("#engModal");
    if (!modal) return;
    document.querySelectorAll("[data-open-eng]").forEach((btn) => {
      btn.addEventListener("click", () => {
        prefillEngagementForm();
        modal.showModal();
      });
    });
    document.querySelectorAll("[data-quick-eng]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await quickStartEngagement();
        } catch (e) {
          toast(String(e.message || e), true);
        } finally {
          btn.disabled = false;
        }
      });
    });
    const cancel = $("#btnCancelEng");
    if (cancel) cancel.onclick = () => modal.close();
    const form = $("#newEngForm");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const title = (fd.get("title") || "").toString().trim() || "Field op";
        const eng = await createEngagement({
          title,
          roe: (fd.get("roe") || "").toString(),
          operator: "operator",
          declared_locus: {
            lat: Number(fd.get("lat")),
            lng: Number(fd.get("lng")),
            label: fd.get("locus_label") || "Engagement locus",
            gps: true,
          },
        });
        toast("Engagement started");
        modal.close();
        if (typeof window.onEngagementCreated === "function") {
          window.onEngagementCreated(eng);
        }
      } catch (err) {
        toast(String(err.message || err), true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  async function prefillEngagementForm() {
    const form = $("#newEngForm");
    if (!form) return;
    const hint = $("#gpsHint");
    if (hint) hint.textContent = "Fetching location…";
    const locus = await resolveLocus(false);
    const lat = form.querySelector('[name="lat"]');
    const lng = form.querySelector('[name="lng"]');
    const label = form.querySelector('[name="locus_label"]');
    if (lat) lat.value = Number(locus.lat).toFixed(6);
    if (lng) lng.value = Number(locus.lng).toFixed(6);
    if (label && locus.gps) label.value = locus.label || "Laptop GPS";
    if (hint) {
      hint.textContent = locus.gps
        ? "Locus: " + Number(locus.lat).toFixed(5) + ", " + Number(locus.lng).toFixed(5)
        : "Using last known locus — click Use laptop GPS to refresh";
      hint.style.color = locus.gps ? "var(--accent)" : "var(--muted)";
    }
    if (window.ARIAGPS) {
      ARIAGPS.warm({ pushRoot: false }).then((fix) => {
        if (fix) ARIAGPS.fillForm(form);
      });
    }
  }

  async function runSkill(skill, query) {
    const eng = await loadActive();
    if (!eng) {
      toast("Start an engagement first", true);
      const modal = $("#engModal");
      if (modal) modal.showModal();
      throw new Error("no engagement");
    }
    return api("/api/skills/run", {
      method: "POST",
      body: JSON.stringify({
        engagement_id: eng.id,
        skill,
        query,
      }),
    });
  }

  const modalHtml = `
<dialog id="engModal">
  <form method="dialog" id="newEngForm">
    <h3>New engagement</h3>
    <div class="field"><label>Title</label><input name="title" placeholder="Field op (optional)"/></div>
    <div class="field"><label>ROE</label><input name="roe" placeholder="Authorized scope (optional)"/></div>
    <p id="gpsHint" class="muted" style="font-size:12px;margin:.25rem 0 .75rem">Fetching location…</p>
    <input type="hidden" name="locus_label" value="Laptop GPS"/>
    <input type="hidden" name="lat" value="39.3626"/>
    <input type="hidden" name="lng" value="-76.5688"/>
    <div class="modal-actions">
      <button type="button" class="btn" data-gps-locate>Refresh GPS</button>
      <button type="submit" class="btn primary">Start</button>
      <button type="button" class="btn" id="btnCancelEng">Cancel</button>
    </div>
  </form>
</dialog>`;

  function ensureModal() {
    if (!$("#engModal")) document.body.insertAdjacentHTML("beforeend", modalHtml);
    bindEngagementModal();
    if (window.ARIAGPS) ARIAGPS.bind({});
  }

  return {
    $,
    api,
    toast,
    esc,
    mountShell,
    ensureModal,
    loadActive,
    setActiveId,
    getActiveId,
    quickStartEngagement,
    createEngagement,
    deleteEngagement,
    clearAudit,
    runSkill,
  };
})();
