/* ARIA Kit — one dashboard, click-through tabs, full tool parity */
window.ARIAKit = (function () {
  const TABS = ["root", "radar", "run", "facesearch", "engagements"];
  const SKILLS = ["seed", "osint", "glass", "web3", "rf"];
  const SKILL_META = {
    seed: {
      title: "Seed / Identity",
      hint: "name · @handle · email · phone · domain · IP",
      btn: "Run Seed",
    },
    osint: { title: "OSINT", hint: "example.com or IP", btn: "Run OSINT" },
    glass: { title: "Glass / Camera", hint: "1.2.3.4 or 192.168.1.0/24", btn: "Run Glass" },
    web3: { title: "Web3 / Chain", hint: "0x…", btn: "Run Web3" },
    rf: { title: "RF / Root", hint: "http://192.168.4.1", btn: "Pull devices" },
  };

  let activeTab = "root";
  let activeSkill = "seed";
  let radarReady = false;
  let rootDevices = [];
  let engagement = null;
  let domainCtrl = null;
  let rootPushTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setTab(tab, skill) {
    if (!TABS.includes(tab)) tab = "root";
    activeTab = tab;
    if (skill && SKILLS.includes(skill)) activeSkill = skill;

    document.querySelectorAll("[data-kit-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.kitTab === tab);
    });
    document.querySelectorAll(".kit-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === "panel-" + tab);
    });
    document.querySelectorAll("[data-kit-skill]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.kitSkill === activeSkill);
    });

    const runBar = $("runSkillBar");
    if (runBar) runBar.style.display = tab === "run" ? "flex" : "none";

    location.hash = tab === "run" ? "run-" + activeSkill : tab;
    updateHead(tab);

    if (tab === "radar") ensureRadar();
    if (tab === "run") ensureRun();
    if (tab === "facesearch" && window.ARIAFaceSearch) ARIAFaceSearch.mount();
    if (tab === "engagements") loadEngagements();
    if (tab === "root") pingRoot();

    document.body.dataset.gpsRoot = tab === "radar" || tab === "root" ? "" : undefined;
  }

  function updateHead(tab) {
    const titles = {
      root: ["Root", "ESP32 kit dashboard — live sniff on 192.168.4.1"],
      radar: ["Stem · Radar", "Merged field view — pull Root, laptop GPS inject, engagement pins"],
      run: [SKILL_META[activeSkill].title, "Domain report on this page"],
      facesearch: ["FaceSearch AI", "Reverse face search — Yandex + Bing Visual, graded local confidence"],
      engagements: ["Engagements", "All jobs — click a card to set active and run skills"],
    };
    const t = titles[tab] || titles.root;
    $("kitTitle").textContent = t[0];
    $("kitSub").textContent = t[1];
  }

  function parseHash() {
    const h = (location.hash || "#root").replace(/^#/, "");
    if (h === "globe") {
      setTab("engagements");
      return;
    }
    if (h.startsWith("run-") && SKILLS.includes(h.slice(4))) {
      setTab("run", h.slice(4));
      return;
    }
    if (TABS.includes(h)) setTab(h);
    else setTab("root");
  }

  /* —— Root —— */
  async function pingRoot() {
    const base = ($("rootBaseKit") && $("rootBaseKit").value.trim()) || "http://192.168.4.1";
    const chip = $("rootStatus");
    if (!chip) return;
    chip.textContent = "checking…";
    chip.className = "kit-status pending";
    try {
      const r = await ARIA.api("/api/root/ping?base=" + encodeURIComponent(base));
      if (r.ok) {
        chip.textContent = "Root online";
        chip.className = "kit-status ok";
      } else {
        chip.textContent = r.error || "Unreachable";
        chip.className = "kit-status err";
      }
    } catch (e) {
      chip.textContent = "Join root Wi‑Fi";
      chip.className = "kit-status err";
    }
  }

  async function pullRoot(toastMsg) {
    const base = ($("rootBaseKit") && $("rootBaseKit").value.trim()) || "http://192.168.4.1";
    try {
      const data = await ARIA.api("/api/root/devices?base=" + encodeURIComponent(base));
      rootDevices = ARIARadar.rootToDevices(data);
      await syncRadar();
      ARIA.toast(toastMsg || "Root: " + rootDevices.length + " device(s)");
      return data;
    } catch (e) {
      ARIA.toast(String(e.message || e), true);
      return null;
    }
  }

  /* —— Radar —— */
  async function syncRadar() {
    engagement = await ARIA.loadActive();
    const pins = engagement
      ? ARIARadar.pinsToDevices(engagement.pins || [], engagement.declared_locus)
      : [];
    ARIARadar.merge(rootDevices, pins);
  }

  function ensureRadar() {
    if (radarReady) {
      requestAnimationFrame(() => {
        ARIARadar.fit();
        setTimeout(() => ARIARadar.fit(), 120);
      });
      syncRadar();
      return;
    }
    radarReady = true;
    ARIARadar.init({});
    $("btnPause").onclick = () => ARIARadar.togglePause();
    $("btnRootPull").onclick = () => pullRoot();
    syncRadar();
    requestAnimationFrame(() => ARIARadar.fit());
    setTimeout(() => ARIARadar.fit(), 200);
    setTimeout(() => ARIARadar.fit(), 600);

    if (!rootPushTimer) {
      rootPushTimer = setInterval(() => {
        if (activeTab !== "radar" && activeTab !== "root") return;
        const base = $("rootBase").value.trim();
        const fix = ARIAGPS.last();
        if (fix) ARIAGPS.pushToRoot(fix, base).catch(() => {});
      }, 20000);
    }
  }

  async function refreshEngagementViews() {
    engagement = await ARIA.loadActive();
    if (radarReady) syncRadar();
    if (domainCtrl) ARIADomain.refreshLabel($("runLabel"), engagement);
  }

  /* —— Run / domains —— */
  function ensureRun() {
    const meta = SKILL_META[activeSkill];
    $("runPanelTitle").textContent = meta.title + " report";
    $("runQuery").placeholder = meta.hint;
    $("btnRunSkill").textContent = meta.btn;
    const pingBtn = $("btnRunPing");
    if (pingBtn) pingBtn.style.display = activeSkill === "rf" ? "inline-flex" : "none";
    if (activeSkill === "rf" && !$("runQuery").value.trim()) {
      $("runQuery").value = "http://192.168.4.1";
    }
    try {
      const pivot = sessionStorage.getItem("aria_pivot");
      if (pivot) {
        $("runQuery").value = pivot;
        sessionStorage.removeItem("aria_pivot");
      }
    } catch (e) {}

    domainCtrl = ARIADomain.mount(activeSkill, {
      noShell: true,
      el: {
        q: $("runQuery"),
        out: $("runOut"),
        history: $("runHistory"),
        label: $("runLabel"),
        btn: $("btnRunSkill"),
      },
      onResult: async (data) => {
        await refreshEngagementViews();
        if (activeSkill === "rf" && data.result && data.result.report) {
          const devs = data.result.report.devices || [];
          rootDevices = ARIARadar.rootToDevices({ devices: devs });
          if (radarReady) syncRadar();
        }
      },
    });
  }

  function setSkill(skill) {
    if (!SKILLS.includes(skill)) return;
    activeSkill = skill;
    document.querySelectorAll("[data-kit-skill]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.kitSkill === skill);
    });
    $("runOut").innerHTML =
      '<p class="muted">Returns domain-specific report here.</p>';
    $("runHistory").innerHTML = "";
    ensureRun();
    updateHead("run");
    location.hash = "run-" + skill;
  }

  /* —— Engagements —— */
  async function loadEngagements() {
    const dash = await ARIA.api("/api/dashboard");
    const s = dash.stats || {};
    $("engStats").innerHTML = [
      ["Engagements", s.total],
      ["Pins", s.pins],
      ["Findings", s.findings],
      ["Actions", s.actions],
    ]
      .map(([k, v]) => `<div class="stat"><b>${v || 0}</b><span>${k}</span></div>`)
      .join("");

    const q = ($("engSearch").value || "").trim().toLowerCase();
    let rows = dash.engagements || [];
    if (q) {
      rows = rows.filter((e) =>
        [e.title, e.id, e.roe, e.declared_locus && e.declared_locus.label]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    const active = ARIA.getActiveId();
    const grid = $("engGrid");
    if (!rows.length) {
      grid.innerHTML = '<p class="muted">No engagements yet — Quick start.</p>';
      return;
    }
    grid.innerHTML = rows
      .map((e) => {
        const loc = e.declared_locus || {};
        const on = e.id === active ? " active" : "";
        return `<div class="card${on}" data-id="${ARIA.esc(e.id)}">
          <h3>${ARIA.esc(e.title)}</h3>
          <div class="eid">${ARIA.esc(e.id)}</div>
          <div class="meta">${(e.pins || []).length} pins · ${(e.findings || []).length} findings<br/>${ARIA.esc(e.roe || "No ROE")}</div>
          <div class="mono" style="margin-top:.65rem;font-size:11px;color:var(--accent)">${ARIA.esc(loc.label || "")} · ${loc.lat}, ${loc.lng}</div>
          <div class="card-actions">
            <button type="button" class="btn" data-eng-open>Open</button>
            <button type="button" class="btn" data-eng-export>Export</button>
            <button type="button" class="btn" data-eng-clear>Clear audit</button>
            <button type="button" class="btn danger" data-eng-delete>Delete</button>
          </div>
        </div>`;
      })
      .join("");
    grid.querySelectorAll(".card").forEach((card) => {
      const id = card.dataset.id;
      const title = card.querySelector("h3")?.textContent || id;
      card.querySelector("[data-eng-open]").onclick = (ev) => {
        ev.stopPropagation();
        ARIA.setActiveId(id);
        setTab("run");
      };
      card.querySelector("[data-eng-export]").onclick = async (ev) => {
        ev.stopPropagation();
        const pack = await ARIA.api("/api/engagements/" + id + "/export");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(
          new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" })
        );
        a.download = "ARIA_audit_" + id + ".json";
        a.click();
        ARIA.toast("Audit exported");
      };
      card.querySelector("[data-eng-clear]").onclick = async (ev) => {
        ev.stopPropagation();
        const eng = await ARIA.clearAudit(id, { label: title });
        if (eng) {
          if (ARIA.getActiveId() === id) engagement = eng;
          refreshEngagementViews();
          loadEngagements();
        }
      };
      card.querySelector("[data-eng-delete]").onclick = async (ev) => {
        ev.stopPropagation();
        const ok = await ARIA.deleteEngagement(id, { label: title });
        if (ok) {
          if (ARIA.getActiveId() === id) engagement = null;
          refreshEngagementViews();
          loadEngagements();
        }
      };
      card.onclick = () => {
        ARIA.setActiveId(id);
        setTab("run");
      };
    });
  }

  function bindNav() {
    document.querySelectorAll("[data-kit-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.kitTab));
    });
    document.querySelectorAll("[data-kit-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setTab("run", btn.dataset.kitSkill);
      });
    });
    window.addEventListener("hashchange", parseHash);
  }

  function bindRootPanel() {
    $("btnRootPing").onclick = pingRoot;
    $("btnRootPullKit").onclick = () => pullRoot();
    $("btnRootOpen").onclick = () => {
      const base = $("rootBaseKit").value.trim() || "http://192.168.4.1";
      window.open(base, "_blank");
    };
    $("rootFrameReload").onclick = () => {
      const f = $("rootFrame");
      f.src = f.src;
    };
    $("rootBaseKit").addEventListener("change", pingRoot);
  }

  function boot() {
    ARIA.ensureModal();
    ARIAGPS.bind({
      pushRoot: true,
      rootBase: () =>
        (activeTab === "radar" ? $("rootBase") : $("rootBaseKit")).value.trim() ||
        "http://192.168.4.1",
      onEngagementLocus: (eng) => {
        engagement = eng;
        refreshEngagementViews();
      },
    });

    bindNav();
    bindRootPanel();
    $("btnEngRefresh").onclick = loadEngagements;
    $("engSearch").oninput = loadEngagements;
    $("btnDeleteAllEng").onclick = async () => {
      const dash = await ARIA.api("/api/dashboard");
      const rows = dash.engagements || [];
      if (!rows.length) return ARIA.toast("Nothing to delete");
      if (!confirm("Delete all " + rows.length + " engagement(s)?\n\nThis cannot be undone.")) return;
      for (const e of rows) {
        await ARIA.deleteEngagement(e.id, { label: e.title, skipConfirm: true });
      }
      engagement = null;
      refreshEngagementViews();
      loadEngagements();
      ARIA.toast("All engagements deleted");
    };

    window.onEngagementCreated = (eng) => {
      engagement = eng;
      refreshEngagementViews();
      loadEngagements();
    };
    window.onSkillResult = () => refreshEngagementViews();

    parseHash();
    ARIA.api("/api/dashboard")
      .then((d) => {
        const s = d.stats || {};
        $("kitStats").innerHTML = [
          ["Eng", s.total],
          ["Pins", s.pins],
          ["Find", s.findings],
        ]
          .map(([k, v]) => `<span><b>${v || 0}</b> ${k}</span>`)
          .join("");
      })
      .catch(() => {});
  }

  return { boot, setTab, setSkill, pullRoot, refreshEngagementViews };
})();
