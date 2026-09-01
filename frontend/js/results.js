/* Domain-specific result renderers — each skill owns its page output */
window.ARIAResults = (function () {
  function esc(s) {
    return window.ARIA ? ARIA.esc(s) : String(s ?? "");
  }

  function kv(rows) {
    return (
      '<dl class="res-kv">' +
      rows
        .filter((r) => r[1] != null && r[1] !== "")
        .map(
          ([k, v]) =>
            `<dt>${esc(k)}</dt><dd>${typeof v === "string" && v.startsWith("<") ? v : esc(v)}</dd>`
        )
        .join("") +
      "</dl>"
    );
  }

  function badge(text, kind) {
    return `<span class="res-badge ${kind || ""}">${esc(text)}</span>`;
  }

  function pivots(pivots) {
    if (!pivots || !pivots.length) return "";
    return (
      '<div class="res-section"><h4>Suggested pivots</h4><div class="res-pivots">' +
      pivots
        .map(
          (p) =>
            `<a class="res-pivot" href="/#run-${esc(p.skill)}" data-pivot-q="${esc(p.query)}" onclick="sessionStorage.setItem('aria_pivot',this.dataset.pivotQ)">${esc(p.label)} → ${esc(p.query)}</a>`
        )
        .join("") +
      "</div></div>"
    );
  }

  function renderSeed(report, result) {
    if (report.error && report.status === "error") {
      return (
        `<div class="res-card err"><strong>Seed / Identity</strong>` +
        `<p>${esc(report.error)}</p>` +
        `<p class="muted" style="margin-top:.75rem;font-size:12px">Seed engine unavailable — restart with <span class="mono">./start.sh</span> from the ARIA directory.</p></div>`
      );
    }

    const id = report.identity || {};
    const pkg = report.package || {};
    const engLoc = report.engagement_locus || report.anchor || {};
    const subjectGeo = report.subject_geo || [];
    const mapStatus = report.map_status || (subjectGeo.length ? "subject_geo" : "unplaced");
    const status =
      report.status === "ok"
        ? badge(
            mapStatus === "unplaced" && (pkg.seed_type === "name" || id.type === "name")
              ? "identity · no geo"
              : report.engine === "finch"
                ? "Finch engine"
                : "ok",
            mapStatus === "unplaced" ? "warn" : "ok"
          )
        : badge("partial", "warn");

    let html =
      '<div class="res-card">' +
      `<div class="res-head"><strong>${esc(pkg.full_name || id.full_name || report.query)}</strong>${status}</div>` +
      kv([
        ["Query", report.query],
        ["Type", pkg.seed_type || id.type],
        ["Normalised", pkg.normalised || id.normalized],
        pkg.confidence_score != null ? ["Confidence", pkg.confidence_score + "%"] : null,
        pkg.completeness_score != null ? ["Completeness", pkg.completeness_score + "%"] : null,
        pkg.verdict ? ["Verdict", pkg.verdict] : null,
        pkg.total_findings != null ? ["Findings", pkg.total_findings] : null,
        pkg.queries_performed != null ? ["Queries", pkg.queries_performed] : null,
        pkg.elapsed_seconds != null ? ["Elapsed", pkg.elapsed_seconds + "s"] : null,
        pkg.cache && pkg.cache.hit ? ["Cache", "hit · " + (pkg.cache.freshness_days || 0).toFixed(1) + "d"] : null,
        engLoc.lat != null
          ? [
              "Your engagement locus",
              `${engLoc.lat}, ${engLoc.lng}` + (engLoc.label ? " (" + engLoc.label + ")" : "") + " — operator only",
            ]
          : null,
        subjectGeo.length
          ? ["Subject on map", subjectGeo.length + " location(s) from package"]
          : mapStatus === "unplaced"
            ? ["Subject on map", "Not placed — no correlated geo in package"]
            : null,
      ]);

    if (subjectGeo.length) {
      html +=
        '<div class="res-section"><h4>Subject locations (mapped)</h4><ul class="res-list">' +
        subjectGeo
          .map(
            (sg) =>
              `<li><strong>${esc(sg.label)}</strong> · ${sg.lat}, ${sg.lng} <span class="muted">(${esc(sg.source || "package")})</span></li>`
          )
          .join("") +
        "</ul></div>";
    }

    const photos = report.photos || [];
    if (photos.length) {
      html +=
        '<div class="res-section"><h4>Profile photos (' +
        (report.photo_count || photos.length) +
        ")</h4><div class=\"res-photos\">" +
        photos
          .slice(0, 8)
          .map(
            (p) =>
              `<a href="${esc(p.url || "#")}" target="_blank" rel="noopener" class="res-photo">` +
              `<img src="${esc(p.url || "")}" alt="" loading="lazy" onerror="this.parentElement.classList.add('broken')"/>` +
              `<span>${esc(p.platform || p.source || "photo")}</span></a>`
          )
          .join("") +
        "</div></div>";
    }

    const social = report.social_media || [];
    if (social.length) {
      html +=
        '<div class="res-section"><h4>Social</h4><div class="res-links">' +
        social
          .map((s) => {
            const label = (s.platform || "link") + (s.handle ? " · @" + s.handle : "");
            const href = s.url || "#";
            return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
          })
          .join("") +
        "</div></div>";
    }

    const sections = report.sections || {};
    const sectionLabels = {
      identifiers: "Identifiers",
      contact: "Contact",
      digital: "Digital footprint",
      associations: "Associations",
      property: "Property",
      criminal: "Criminal / legal",
    };
    for (const [key, label] of Object.entries(sectionLabels)) {
      const items = sections[key] || [];
      if (!items.length) continue;
      html +=
        '<div class="res-section"><h4>' +
        esc(label) +
        '</h4><ul class="res-list">' +
        items.map((n) => `<li>${esc(n)}</li>`).join("") +
        "</ul></div>";
    }

    if (pkg.sources_used && pkg.sources_used.length) {
      html +=
        '<div class="res-section"><h4>Sources</h4><div class="res-chips">' +
        pkg.sources_used.slice(0, 16).map((s) => badge(s, "")).join("") +
        "</div></div>";
    }

    if (report.secondary_count) {
      html += `<p class="muted" style="margin-top:.75rem;font-size:12px">${report.secondary_count} secondary profile(s) in package</p>`;
    }

    if (report.next_rails && report.next_rails.length) {
      html +=
        '<div class="res-section"><h4>Next rails</h4><ul class="res-list">' +
        report.next_rails.map((n) => `<li>${esc(n)}</li>`).join("") +
        "</ul></div>";
    }
    html += pivots(report.pivots);
    html += "</div>";
    return html;
  }

  function renderOsint(report) {
    if (report.error && report.status !== "ok") {
      return `<div class="res-card err"><strong>OSINT</strong><p>${esc(report.error)}</p></div>`;
    }
    const dns = report.dns || {};
    let html =
      '<div class="res-card">' +
      `<div class="res-head"><strong>${esc(report.query)}</strong>${badge(report.host_count + " host(s)", "ok")}</div>`;

    html += '<div class="res-section"><h4>DNS</h4>';
    html += kv([
      ["A", (dns.a || []).join(", ") || "—"],
      ["MX", (dns.mx || []).slice(0, 3).join(", ") || "—"],
    ]);
    html += "</div>";

    if (report.hosts && report.hosts.length) {
      html += '<div class="res-section"><h4>Hosts</h4><table class="res-table"><thead><tr><th>IP</th><th>Location</th><th>Org</th><th>Map</th></tr></thead><tbody>';
      for (const h of report.hosts) {
        const g = h.geo || {};
        const loc = g.schematic
          ? "LAN schematic"
          : [g.city, g.country].filter(Boolean).join(", ") || "—";
        const map = g.lat != null ? `${Number(g.lat).toFixed(4)}, ${Number(g.lng).toFixed(4)}` : "—";
        html += `<tr><td class="mono">${esc(h.ip)}</td><td>${esc(loc)}</td><td>${esc(g.org || "—")}</td><td class="mono muted">${esc(map)}</td></tr>`;
      }
      html += "</tbody></table></div>";
    }
    html += "</div>";
    return html;
  }

  function renderGlass(report) {
    if (report.error && report.status !== "ok") {
      return `<div class="res-card err"><strong>Glass</strong><p>${esc(report.error)}</p></div>`;
    }
    const g = report.geo || {};
    const fab = report.fabric || {};
    const status = fab.schematic ? badge("LAN schematic", "warn") : badge("public routable", "ok");
    let html =
      '<div class="res-card">' +
      `<div class="res-head"><strong>${esc(report.query)}</strong>${status}</div>` +
      kv([
        ["IP", report.target && report.target.ip],
        report.target && report.target.cidr ? ["CIDR", report.target.cidr] : null,
        ["City", g.city],
        ["Country", g.country],
        ["Org", fab.org || g.org],
        ["ASN", fab.asn],
        g.lat != null ? ["Coords", `${g.lat}, ${g.lng}`] : null,
        ["GPS honest", g.schematic ? "No — schematic layout" : g.gps ? "Yes — geoIP" : "No"],
      ]);

    if (report.exposure && report.exposure.length) {
      html +=
        '<div class="res-section"><h4>Fabric notes</h4><ul class="res-list">' +
        report.exposure.map((n) => `<li>${esc(n)}</li>`).join("") +
        "</ul></div>";
    }
    html += "</div>";
    return html;
  }

  function renderWeb3(report) {
    if (report.error && report.status !== "ok") {
      return `<div class="res-card err"><strong>Web3</strong><p>${esc(report.error)}</p></div>`;
    }
    const mapBadge =
      report.map_status === "anchored" ? badge("locus anchored", "ok") : badge("unplaced", "warn");
    let html =
      '<div class="res-card">' +
      `<div class="res-head"><strong class="mono">${esc(report.short || report.query)}</strong>${mapBadge}</div>` +
      kv([
        ["Address", report.query],
        ["Geo honesty", report.geo_honesty],
        report.locus && report.locus.label ? ["Engagement locus", report.locus.label] : null,
        report.locus && report.locus.lat != null
          ? ["Map pin", `${report.locus.lat}, ${report.locus.lng} (offset)`]
          : null,
      ]);

    if (report.explorers && report.explorers.length) {
      html +=
        '<div class="res-section"><h4>Explorers</h4><div class="res-links">' +
        report.explorers
          .map((e) => `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.name)}</a>`)
          .join("") +
        "</div></div>";
    }
    html += "</div>";
    return html;
  }

  function renderRf(report) {
    if (report.error && report.status !== "ok") {
      return `<div class="res-card err"><strong>RF / Root</strong><p>${esc(report.error)}</p><p class="muted">Join Wi‑Fi <span class="mono">root</span> / <span class="mono">root-radar</span> then pull again.</p></div>`;
    }
    const gps = report.scanner_gps;
    let html =
      '<div class="res-card">' +
      `<div class="res-head"><strong>Root @ ${esc(report.query)}</strong>${badge(report.count + " devices", "ok")}</div>`;

    if (gps && gps.valid !== false) {
      html += kv([
        ["Scanner GPS", `${gps.lat}, ${gps.lon || gps.lng}`],
        ["Source", gps.source || "kit"],
      ]);
    }

    if (report.bands && report.bands.length) {
      html += '<div class="res-chips">' + report.bands.map((b) => badge(b, "")).join("") + "</div>";
    }

    const devs = report.devices || [];
    if (devs.length) {
      html +=
        '<div class="res-section"><h4>Devices</h4><div class="res-devices">' +
        devs
          .slice(0, 24)
          .map((d) => {
            const name = d.ssid || d.name || d.mac || "?";
            const rssi = d.rssi != null ? d.rssi + " dBm" : "";
            const band = d.band || d.type || "";
            return `<div class="res-device"><strong>${esc(name)}</strong><span class="mono muted">${esc(d.mac || "")}</span><span>${esc(band)} ${esc(rssi)}</span></div>`;
          })
          .join("") +
        "</div>";
      if (devs.length > 24) html += `<p class="muted">+ ${devs.length - 24} more — open Radar for full sweep</p>`;
    }
    html +=
      '<div class="res-foot"><a class="btn" href="/radar">Open radar view</a></div></div>';
    return html;
  }

  function renderHistory(skill, engagement) {
    if (!engagement) return "";
    const pins = (engagement.pins || []).filter((p) => p.source === skill).slice(-8).reverse();
    const findings = (engagement.findings || []).filter((f) => f.source === skill).slice(-6).reverse();
    if (!pins.length && !findings.length) return "";

    let html = '<div class="res-history"><h4>Session — ' + esc(skill) + "</h4>";
    if (findings.length) {
      html += findings.map((f) => `<div class="finding">${esc(f.summary)}</div>`).join("");
    }
    if (pins.length) {
      html +=
        '<ul class="res-list mono" style="margin-top:.5rem">' +
        pins.map((p) => `<li>${esc(p.label)} · ${p.lat}, ${p.lng}</li>`).join("") +
        "</ul>";
    }
    html += "</div>";
    return html;
  }

  function render(skill, data) {
    const report = (data.result && data.result.report) || {};
    const engagement = data.engagement;
    let body = "";
    switch (skill) {
      case "seed":
        body = renderSeed(report, data.result);
        break;
      case "osint":
        body = renderOsint(report);
        break;
      case "glass":
        body = renderGlass(report);
        break;
      case "web3":
        body = renderWeb3(report);
        break;
      case "rf":
        body = renderRf(report);
        break;
      default:
        body = `<div class="res-card"><pre class="mono">${esc(JSON.stringify(data.result, null, 2))}</pre></div>`;
    }
  const hist = renderHistory(skill, engagement);
  const geoNote =
    (data.result.pins || []).length > 0
      ? '<p class="res-globe-note muted">Subject-correlated pins saved to engagement.</p>'
      : skill === "seed"
        ? '<p class="res-globe-note muted">Name/identity seeds are not pinned to your laptop GPS — only when the package contains subject geo.</p>'
        : "";
    return body + hist + geoNote;
  }

  return { render, renderHistory };
})();
