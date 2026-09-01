/* MapLibre GL + OpenFreeMap — no API key, globe projection, sharp vector tiles */
window.ARIAMap = (function () {
  let map = null;
  let markers = [];

  function init(containerId, opts) {
    opts = opts || {};
    if (typeof maplibregl === "undefined") {
      console.error("MapLibre failed to load");
      return null;
    }

    map = new maplibregl.Map({
      container: containerId,
      // OpenFreeMap — free vector tiles, no token (Finch-style: no Ion / no paid key)
      style: "https://tiles.openfreemap.org/styles/dark",
      center: opts.center || [-40, 20],
      zoom: opts.zoom != null ? opts.zoom : 1.6,
      attributionControl: true,
      antialias: true,
      fadeDuration: 0,
      refreshExpiredTiles: true,
      maxPitch: 85,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      try {
        // MapLibre 4+ globe — crystal clear vector at every zoom
        if (typeof map.setProjection === "function") {
          map.setProjection({ type: "globe" });
        }
      } catch (e) {
        console.warn("globe projection unavailable, using mercator", e);
      }
      map.resize();
      if (typeof opts.onReady === "function") opts.onReady(map);
    });

    window.addEventListener("resize", () => map && map.resize());
    return map;
  }

  function clearMarkers() {
    markers.forEach((m) => m.remove());
    markers = [];
  }

  function colorFor(source) {
    const mapc = {
      seed: "#e2c07a",
      glass: "#2ee6a8",
      osint: "#7eb8ff",
      web3: "#e0894a",
      declared: "#f4f7f5",
    };
    return mapc[source] || "#2ee6a8";
  }

  function addPin(pin, onClick) {
    if (pin.lat == null || pin.lng == null || !map) return;
    const el = document.createElement("div");
    el.style.width = "12px";
    el.style.height = "12px";
    el.style.borderRadius = "50%";
    el.style.background = colorFor(pin.source || pin.kind);
    el.style.border = "2px solid #050708";
    el.style.boxShadow = "0 0 0 3px rgba(46,230,168,0.25)";
    el.style.cursor = "pointer";
    el.title = pin.label || pin.source || "";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onClick) onClick(pin);
    });
    const m = new maplibregl.Marker({ element: el })
      .setLngLat([pin.lng, pin.lat])
      .addTo(map);
    markers.push(m);
  }

  function setPins(pins, onClick) {
    clearMarkers();
    (pins || []).forEach((p) => addPin(p, onClick));
  }

  function setDeclared(locus, onClick) {
    if (!locus || locus.lat == null) return;
    addPin(
      {
        lat: locus.lat,
        lng: locus.lng,
        label: locus.label || "Declared",
        source: "declared",
        kind: "declared",
        meta: { note: "Where you said you were working" },
      },
      onClick
    );
  }

  function flyTo(lat, lng, zoom) {
    if (!map) return;
    map.flyTo({
      center: [lng, lat],
      zoom: zoom != null ? zoom : 10,
      essential: true,
      duration: 1600,
    });
  }

  function resize() {
    if (map) map.resize();
  }

  return {
    init,
    setPins,
    setDeclared,
    clearMarkers,
    flyTo,
    resize,
    getMap: () => map,
  };
})();
