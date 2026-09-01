/* FaceSearch AI — photo or @handle reverse face search (Finch Visage embedded) */
window.ARIAFaceSearch = (function () {
  let progressTimer = null;
  let ready = false;

  function $(id) {
    return document.getElementById(id);
  }

  function bandClass(conf) {
    const c = Number(conf) || 0;
    if (c >= 85) return "high";
    if (c >= 65) return "medium";
    if (c >= 45) return "low";
    return "weak";
  }

  function esc(s) {
    return ARIA.esc(String(s ?? ""));
  }

  function resolveHandleInput() {
    const raw = ($("faceHandle") && $("faceHandle").value.trim()) || "";
    if (raw) return raw;
    const user = ($("faceUsername") && $("faceUsername").value.trim()) || "";
    const plat = ($("facePlatform") && $("facePlatform").value.trim()) || "";
    if (!user) return "";
    return plat ? plat + ":" + user.replace(/^@/, "") : "@" + user.replace(/^@/, "");
  }

  function subjectName() {
    return ($("faceName") && $("faceName").value.trim()) || "";
  }

  function hasPhoto() {
    return $("facePhoto") && $("facePhoto").files && $("facePhoto").files[0];
  }

  function hasSearchInput() {
    return hasPhoto() || !!resolveHandleInput() || !!subjectName();
  }

  async function postSearch(fields) {
    const fd = new FormData();
    const file = hasPhoto() ? $("facePhoto").files[0] : null;
    if (file) fd.append("file", file);
    Object.entries(fields || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") fd.append(k, String(v));
    });
    const res = await fetch("/api/facesearch/reverse", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const d = data.detail;
      throw new Error(typeof d === "string" ? d : res.statusText || "request failed");
    }
    return data;
  }

  function showPreviewFromB64(b64, label) {
    const prev = $("facePreview");
    if (!prev || !b64) return;
    prev.innerHTML =
      `<img src="data:image/jpeg;base64,${b64}" alt="probe"/>` +
      (label ? `<p class="muted" style="font-size:11px;margin-top:.35rem">${esc(label)}</p>` : "");
  }

  function renderAvatarSources(sources, chosen) {
    const el = $("faceAvatarSources");
    if (!el) return;
    if (!sources || !sources.length) {
      el.textContent = "";
      return;
    }
    const lines = sources.slice(0, 6).map((s) => {
      const mark = chosen && chosen.url === s.url ? " ✓" : "";
      return (s.platform || s.engine || "web") + "/" + (s.handle || "?") + mark;
    });
    el.textContent = "Public avatar URLs tried: " + lines.join(" · ");
  }

  function setProgress(pct, msg) {
    const wrap = $("faceProgressWrap");
    const bar = $("faceProgressBar");
    const label = $("faceProgressLabel");
    if (wrap) wrap.style.display = pct > 0 ? "block" : "none";
    if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + "%";
    if (label) label.textContent = msg || "";
  }

  function renderMatches(data) {
    const payload = data.result || data;
    const out = $("faceResults");
    const grid = $("faceMatchGrid");
    const matches = payload.matches || [];
    const encoded = payload.faces_encoded ?? "?";
    const engines = (payload.engines_used || []).join(", ") || "Yandex, Bing Visual";
    const probe = payload.probe_source === "social_avatar" ? " (from social profile photo)" : "";

    if (out) {
      out.innerHTML =
        `<div class="res-card">` +
        `<p><strong>${matches.length}</strong> graded match(es) · <strong>${esc(encoded)}</strong> face(s) encoded${esc(probe)}</p>` +
        `<p class="muted" style="font-size:12px;margin-top:.35rem">Engines: ${esc(engines)}</p>` +
        (payload.dossier_section
          ? `<div style="margin-top:.75rem;font-size:13px;line-height:1.5">${payload.dossier_section}</div>`
          : "") +
        `</div>`;
    }

    if (!grid) return;
    if (!matches.length) {
      const hint =
        payload.images_searched === 0 && hasPhoto() && !subjectName() && !resolveHandleInput()
          ? "No results — add a subject name or @handle with the photo (reverse upload alone often finds nothing)."
          : "No public images found — try a different name, @handle, or check internet connection.";
      grid.innerHTML = '<p class="muted">' + esc(hint) + "</p>";
      return;
    }
    grid.innerHTML = matches
      .map((m) => {
        const conf = m.confidence ?? m.confidence_pct ?? 0;
        const band = m.confidence_band || m.band || bandClass(conf);
        const url = m.source_url || m.url || m.image_url || "#";
        const title = [m.platform, m.handle ? "@" + m.handle : "", m.engine].filter(Boolean).join(" · ") || "public image";
        const isVisual = Number(conf) <= 45 && Number(m.distance || 0) >= 0.99;
        const bandLabel = isVisual ? "photo" : band;
        let thumb = m.thumb || m.thumbnail || "";
        if (!thumb && m.thumbnail_b64) thumb = "data:image/jpeg;base64," + m.thumbnail_b64;
        return (
          `<a class="face-card" href="${esc(url)}" target="_blank" rel="noopener">` +
          (thumb
            ? `<img src="${thumb.startsWith("data:") ? thumb : esc(thumb)}" alt="" loading="lazy"/>`
            : `<div class="face-card-placeholder">◇</div>`) +
          `<span class="face-band ${esc(band)}">${esc(bandLabel)}${isVisual ? "" : " " + Math.round(conf) + "%"}</span>` +
          `<span class="face-card-title">${esc(title)}</span>` +
          `</a>`
        );
      })
      .join("");
  }

  async function refreshHealth() {
    const el = $("faceEngineStatus");
    if (!el) return;
    el.textContent = "checking Visage engine…";
    el.className = "kit-status pending";
    try {
      const h = await ARIA.api("/api/facesearch/health");
      const rev = h.reverse || {};
      const engines = (rev.engines || ["yandex", "bing_visual"]).join(" · ");
      if (h.ok) {
        el.textContent = `FaceSearch ready (${h.mode}) — ${engines} · photo or @handle`;
        el.className = "kit-status ok";
      } else {
        el.textContent = h.error || "Visage unavailable — restart ./start.sh";
        el.className = "kit-status err";
      }
    } catch (e) {
      el.textContent = String(e.message || e);
      el.className = "kit-status err";
    }
  }

  async function loadConsent() {
    const el = $("faceConsentText");
    if (!el) return;
    try {
      const c = await ARIA.api("/api/facesearch/consent");
      el.textContent = c.text || c.message || "Authorized use and consent required.";
    } catch (e) {
      el.textContent = "You must have legal authorization and consent to search this face.";
    }
  }

  async function fetchProfilePhoto() {
    const handle = resolveHandleInput();
    if (!handle) {
      ARIA.toast("Enter @handle or platform + username", true);
      return;
    }
    try {
      setProgress(15, "Fetching public profile photo…");
      const plat = ($("facePlatform") && $("facePlatform").value.trim()) || "";
      const q =
        handle.includes(":") || handle.startsWith("@")
          ? "handle=" + encodeURIComponent(handle)
          : "handle=" + encodeURIComponent(handle) + (plat ? "&platform=" + encodeURIComponent(plat) : "");
      const data = await ARIA.api("/api/facesearch/avatar?" + q);
      if (data.image_b64) {
        const label =
          (data.chosen && data.chosen.platform ? data.chosen.platform + "/" : "") +
          "@" +
          (data.handle || handle.replace(/^@/, ""));
        showPreviewFromB64(data.image_b64, "Profile photo: " + label);
      }
      renderAvatarSources(data.avatars, data.chosen);
      setProgress(0, "");
      ARIA.toast(data.ok ? "Profile photo loaded" : "No photo downloaded", !data.ok);
    } catch (e) {
      setProgress(0, "");
      ARIA.toast(String(e.message || e), true);
    }
  }

  async function runReverse() {
    const consent = $("faceConsent");
    if (!consent || !consent.checked) {
      ARIA.toast("Check the consent box first", true);
      return;
    }
    const handle = resolveHandleInput();
    const name = subjectName();
    if (!hasSearchInput()) {
      ARIA.toast("Upload a photo, enter @handle, or enter a subject name", true);
      return;
    }
    if (hasPhoto() && !name && !handle) {
      ARIA.toast("Add a subject name or @handle with the photo for image search", true);
      return;
    }
    try {
      const eng = await ARIA.loadActive();
      const eid = eng ? eng.id : "";
      setProgress(8, handle && !hasPhoto() ? "Resolving @handle + searching…" : name && !hasPhoto() ? "Searching public photos by name…" : "Starting reverse face search…");
      clearInterval(progressTimer);
      progressTimer = setInterval(async () => {
        try {
          const p = await ARIA.api("/api/facesearch/progress");
          const stage = p.stage || "";
          let pct = Number(p.percent ?? p.pct ?? 0);
          if (!pct && stage === "reverse") pct = 28;
          else if (!pct && stage === "search") pct = 38;
          else if (!pct && stage === "download_encode") pct = 55;
          else if (!pct && stage === "match") pct = 90;
          if (pct > 0) setProgress(pct, p.detail || p.message || stage || "Searching…");
        } catch (e) {}
      }, 1200);

      const plat = ($("facePlatform") && $("facePlatform").value.trim()) || "";
      const data = await postSearch({
        handle: handle,
        platform: plat,
        person_name: name || handle.replace(/^@/, "") || "photo-seed",
        aliases: ($("faceAliases") && $("faceAliases").value.trim()) || "",
        consent: "true",
        engagement_id: eid,
      });

      clearInterval(progressTimer);
      const payload = data.result || data;
      if (payload.image_b64 || payload.chosen_avatar) {
        showPreviewFromB64(
          payload.image_b64 || (payload.chosen_avatar && payload.chosen_avatar.thumbnail_b64),
          payload.probe_source === "social_avatar" ? "From social profile" : ""
        );
      }
      renderAvatarSources(payload.avatar_sources, payload.chosen_avatar);
      setProgress(100, `Done — ${(payload.matches || []).length} matches`);
      renderMatches(data);
      ARIA.toast("FaceSearch complete");
      if (window.ARIAKit && window.ARIAKit.refreshEngagementViews) {
        window.ARIAKit.refreshEngagementViews();
      }
    } catch (e) {
      clearInterval(progressTimer);
      setProgress(0, "");
      ARIA.toast(String(e.message || e), true);
    }
  }

  async function runDetect() {
    if (!hasPhoto()) {
      ARIA.toast("Upload a photo for local detect", true);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", $("facePhoto").files[0]);
      const res = await fetch("/api/facesearch/detect", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || res.statusText);
      const faces = data.faces || [];
      $("faceResults").innerHTML =
        `<div class="res-card"><p><strong>${faces.length}</strong> face(s) detected locally.</p>` +
        `<pre class="mono" style="font-size:11px;margin-top:.5rem;white-space:pre-wrap;color:var(--muted)">${esc(JSON.stringify(data, null, 2))}</pre></div>`;
      ARIA.toast(faces.length ? `${faces.length} face(s) found` : "No faces in image");
    } catch (e) {
      ARIA.toast(String(e.message || e), true);
    }
  }

  function bind() {
    $("btnFaceSearch") && ($("btnFaceSearch").onclick = () => runReverse());
    $("btnFaceDetect") && ($("btnFaceDetect").onclick = () => runDetect());
    $("btnFacePreview") && ($("btnFacePreview").onclick = () => fetchProfilePhoto());
    $("facePhoto") &&
      $("facePhoto").addEventListener("change", () => {
        const prev = $("facePreview");
        const f = $("facePhoto").files[0];
        if (!prev) return;
        if (!f) {
          prev.innerHTML = "";
          return;
        }
        prev.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="probe"/>`;
        if ($("faceAvatarSources")) $("faceAvatarSources").textContent = "";
      });
  }

  function mount() {
    if (ready) {
      refreshHealth();
      return;
    }
    ready = true;
    bind();
    refreshHealth();
    loadConsent();
  }

  return { mount, runReverse, fetchProfilePhoto };
})();
