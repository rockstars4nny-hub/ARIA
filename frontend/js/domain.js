/* Shared domain page runner — works standalone or inside kit dashboard */
window.ARIADomain = (function () {
  function el(opts, name, fallback) {
    if (opts && opts.el && opts.el[name]) return opts.el[name];
    return document.getElementById(fallback || name);
  }

  async function mount(skill, opts) {
    opts = opts || {};
    if (!opts.noShell) {
      ARIA.mountShell(opts.nav || skill);
      ARIA.ensureModal();
      if (window.ARIAGPS) ARIAGPS.bind({});
    }

    const qEl = el(opts, "q", "q");
    const outEl = el(opts, "out", "out");
    const histEl = el(opts, "history", "history");
    const labelEl = el(opts, "label", "activeLabel");
    const btn = el(opts, "btn", "btnRun");

    const params = new URLSearchParams(location.search);
    if (params.get("q") && qEl) qEl.value = params.get("q");

    let engagement = await ARIA.loadActive();
    refreshLabel(labelEl, engagement);

    if (histEl && engagement) {
      histEl.innerHTML = ARIAResults.renderHistory(skill, engagement);
    }

    if (!btn) return { skill, engagement, run: null };

    async function run() {
      const query = (qEl && qEl.value.trim()) || (opts.defaultQuery && opts.defaultQuery());
      if (!query) {
        ARIA.toast("Enter a query", true);
        return null;
      }
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Running…";
      try {
        const data = await ARIA.runSkill(skill, query);
        engagement = data.engagement || engagement;
        if (outEl) outEl.innerHTML = ARIAResults.render(skill, data);
        if (histEl && engagement) histEl.innerHTML = ARIAResults.renderHistory(skill, engagement);
        refreshLabel(labelEl, engagement);
        const n = ((data.result && data.result.pins) || []).length;
        ARIA.toast(skill + ": done" + (n ? " · " + n + " map pin(s)" : ""));
        if (typeof opts.onResult === "function") opts.onResult(data, skill);
        if (typeof window.onSkillResult === "function") window.onSkillResult(data, skill);
        return data;
      } catch (e) {
        if (String(e.message) !== "no engagement") ARIA.toast(String(e.message || e), true);
        return null;
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    }

    btn.onclick = run;

    if (params.get("q") && params.get("run") === "1") run();

    return { skill, engagement, run };
  }

  function refreshLabel(labelEl, engagement) {
    if (!labelEl) return;
    labelEl.textContent = engagement
      ? "Active: " + engagement.title + " (" + engagement.id + ")"
      : "No engagement — Quick start or Custom.";
  }

  async function boot(skill, opts) {
    return mount(skill, opts);
  }

  return { boot, mount, refreshLabel };
})();
