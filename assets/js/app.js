/* UQ Flood Potential, Barbados. Leaflet plus plain JavaScript.
   Zones load on demand from assets/zones/<bandset>_<cycle>.geojson,
   image overlays from assets/layers/<field>_<cycle>.png */

"use strict";

var D = window.WARN_DATA;
var cycles = D.cycles;
var LB = D.bounds;
var COLORS = D.class_colors, NAMES = D.class_names;

var idx = 0, bandset = "bb", view = "A", field = "class", playing = null;
var map, overlay, zoneLayer, aocLayer, verifLayer = null;
var zoneCache = {};

var sel = document.getElementById("cycsel");
var tip = document.getElementById("tip");

var FIELDS = {
  "class":  { label: "Flood potential class, per pixel", file: "CLS", scale: "class" },
  "none":   { label: "None", file: null },
  "uq_p90": { label: "Forecast ensemble p90", file: "uq_p90", scale: "ef5" },
  "uq_p50": { label: "Forecast ensemble median", file: "uq_p50", scale: "ef5" },
  "uq_p05": { label: "Forecast ensemble p5", file: "uq_p05", scale: "ef5" },
  "ss_p50": { label: "STREAM-Sat QPE median", file: "ss_p50", scale: "ef5" },
  "ss_max": { label: "STREAM-Sat QPE member max", file: "ss_max", scale: "ef5" },
  "qpe":    { label: "Rainfall accumulation, QPE mean", file: "qpe", scale: "qpe" }
};

/* ---------- state in the address ---------- */

function readHash() {
  var h = new URLSearchParams(location.hash.slice(1));
  var c = h.get("c");
  if (c) { var i = cycles.findIndex(function (x) { return x.cycle === c; }); if (i >= 0) idx = i; }
  if (h.get("b") === "gt" || h.get("b") === "bb") bandset = h.get("b");
  if (h.get("v") === "A" || h.get("v") === "B") view = h.get("v");
  if (FIELDS[h.get("f")]) field = h.get("f");
}
function writeHash() {
  var h = new URLSearchParams();
  h.set("c", cycles[idx].cycle); h.set("b", bandset); h.set("v", view); h.set("f", field);
  history.replaceState(null, "", "#" + h.toString());
}

function cycleHour(c) {
  return (parseInt(c.cycle.slice(6, 8), 10) - 16) * 24 + parseInt(c.cycle.slice(9, 11), 10);
}

/* ---------- basemap ----------
   CARTO raster basemaps require an API key since August 2026. This key was issued to the
   University of Iowa for the domains ahwalab.github.io and localhost. It is a browser side
   key: it is visible in this file by design, and CARTO restricts it to those domains.
   To rotate it, replace the value here and in the other two viewer repositories.
   CARTO and OpenStreetMap attribution must stay visible on the map, which it does below. */

var CARTO_KEY = "cb1_2hul_1_d1beea1581cc2f8c94ba52d4";
var CARTO_LIGHT = "https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png" +
                  "?key=" + CARTO_KEY;
var ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/" +
                   "World_Imagery/MapServer/tile/{z}/{y}/{x}";

/* ---------- map ---------- */

function buildMap() {
  map = L.map("map", { zoomControl: true });
  map.attributionControl.setPrefix("");
  var street = L.tileLayer(CARTO_LIGHT, {
    maxZoom: 19, attribution: "OpenStreetMap contributors, CARTO" }).addTo(map);
  var sat = L.tileLayer(ESRI_IMAGERY,
    { maxZoom: 19, attribution: "Esri World Imagery" });
  L.control.layers({ "Street map": street, "Satellite": sat }, {},
    { position: "topleft", collapsed: true }).addTo(map);

  overlay = L.imageOverlay("", LB, { opacity: 0.75, interactive: false });
  overlay.addTo(map);
  if (D.aoc) {
    aocLayer = L.geoJSON(D.aoc, { style: { color: "#0d3b5e", weight: 2,
      dashArray: "5,4", fill: false } }).addTo(map);
  }
  map.fitBounds(LB, { padding: [10, 10] });

  var lg = L.control({ position: "bottomright" });
  lg.onAdd = function () {
    var d = L.DomUtil.create("div", "map-legend");
    d.id = "maplegend";
    return d;
  };
  lg.addTo(map);
}

function updateLegend() {
  var bands = D.bandsets[bandset].bands;
  var lo = ["under " + bands[0], bands[0] + " to " + bands[1],
            bands[1] + " to " + bands[2], bands[2] + " to " + bands[3],
            bands[3] + " and up"];
  var h = "<b>" + (view === "A" ? "Flood potential class" : "Impact adjusted level") + "</b>";
  for (var i = 0; i < 5; i++) {
    h += "<div><i style='background:" + COLORS[i] + "'></i>" + NAMES[i] +
         (view === "A" ? ", " + lo[i] : "") + "</div>";
  }
  if (view === "A") h += "<div style='margin-top:3px;color:#5b6770'>m3/s per km2, ensemble p90</div>";
  if (field === "class") h += "<div style='margin-top:3px;color:#5b6770'>Raster shows the class " +
    "per pixel; zone fills are lightened so both read at once.</div>";
  var el = document.getElementById("maplegend");
  if (el) el.innerHTML = h;
}

/* ---------- zones ---------- */

function zoneStyle(f) {
  var p = f.properties;
  var k = view === "A" ? p.hazard_class : p.level;
  return { color: p.confidence === "LOW" ? "#7a8894" : "#33414d",
           weight: p.confidence === "LOW" ? 1 : 1.4,
           dashArray: p.confidence === "LOW" ? "4,3" : null,
           fillColor: COLORS[k],
           fillOpacity: field === "class"
             ? (p.confidence === "HIGH" ? 0.30 : (p.confidence === "MED" ? 0.20 : 0.12))
             : (p.confidence === "HIGH" ? 0.72 : (p.confidence === "MED" ? 0.58 : 0.42)) };
}

function popupHtml(p) {
  var bands = D.bandsets[bandset].bands;
  var rows = [
    ["Flood potential class", NAMES[p.hazard_class] +
      (p.share_at_class ? ", over " + p.share_at_class + " percent of the zone" : "")],
    ["Worst class present", NAMES[p.worst_class] + ", " + p.share_worst + " percent of the zone"],
    ["Ensemble p90 inside, p90", p.p90 + " m3/s/km2"],
    ["Ensemble p90 inside, max", (p.p90_max === undefined ? "-" : p.p90_max) + " m3/s/km2"],
    ["P(UQ at or above " + bands[0] + ")", p.prob_band1],
    ["Confidence", p.confidence],
    ["Impact axis", p.impact_axis],
    ["Impact adjusted level", NAMES[p.level]],
    ["Area", p.area_km2 + " km2"],
    ["Population inside", p.population.toLocaleString()],
    ["Enumeration districts", p.n_eds]
  ];
  return "<b>Zone " + p.zone + "</b><table>" + rows.map(function (r) {
    return "<tr><td style='color:#5b6770'>" + r[0] + "</td><td><b>" + r[1] + "</b></td></tr>";
  }).join("") + "</table>";
}

function loadZones(cb) {
  var c = cycles[idx].cycle;
  var key = bandset + "_" + c;
  if (zoneCache[key]) { cb(zoneCache[key]); return; }
  fetch("assets/zones/" + key + ".geojson")
    .then(function (r) { return r.json(); })
    .then(function (j) { zoneCache[key] = j; cb(j); })
    .catch(function () { cb({ type: "FeatureCollection", features: [] }); });
}

function drawZones() {
  loadZones(function (j) {
    if (zoneLayer) map.removeLayer(zoneLayer);
    zoneLayer = L.geoJSON(j, {
      style: zoneStyle,
      onEachFeature: function (f, l) { l.bindPopup(popupHtml(f.properties)); }
    });
    if (document.getElementById("zonetoggle").classList.contains("on")) zoneLayer.addTo(map);
    var n = j.features.length;
    document.getElementById("zonecount").textContent = n === 0
      ? "No zone reaches the reporting threshold in this cycle."
      : n + " zone" + (n === 1 ? "" : "s") + " mapped.";
  });
}

/* ---------- draw ---------- */

function draw() {
  var c = cycles[idx];
  sel.value = idx;
  document.getElementById("cyctitle").textContent = "Cycle " + c.cycle;
  var badge = document.getElementById("badge");
  if (c.fim.status === "triggered") { badge.textContent = "FIM triggered"; badge.className = "badge trig"; }
  else { badge.textContent = "below FIM trigger"; badge.className = "badge quiet"; }

  var f = FIELDS[field];
  if (f.file) {
    var stem = f.file === "CLS" ? "cls_" + bandset : f.file;
    overlay.setUrl("assets/layers/" + stem + "_" + c.cycle + ".png");
    var el = overlay.getElement(); if (el) el.style.display = "";
  } else {
    var e2 = overlay.getElement(); if (e2) e2.style.display = "none";
  }

  var z = c.zones[bandset];
  var kv = document.getElementById("kv");
  kv.innerHTML = [
    ["Forecast ensemble p90, max", c.uq.p90 + " m3/s/km2"],
    ["Forecast ensemble median, max", c.uq.p50 + " m3/s/km2"],
    ["Forecast member maximum", c.uq.max + " m3/s/km2"],
    ["STREAM-Sat QPE member max", c.ss.max + " m3/s/km2"],
    ["Rainfall QPE, island mean", c.qpe.mean + " mm"],
    ["Rainfall QPE, maximum", c.qpe.max + " mm"],
    ["Saint Thomas FIM trigger", (c.fim.max_uq === null ? "-" : c.fim.max_uq) + " m3/s/km2"],
    ["Credible signal area", ((z.signal && z.signal.area_km2) || 0) + " km2"],
    ["Zones mapped", z.n]
  ].map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("");

  var tb = document.getElementById("sttable");
  var counts = view === "A" ? z.classes : [null].concat(z.levels || []);
  var h = "<tr><th>" + (view === "A" ? "Flood potential class" : "Impact adjusted level") +
          "</th><th>Zones</th></tr>";
  for (var k = (view === "A" ? 0 : 1); k < 5; k++) {
    var n = counts && counts[k] !== undefined && counts[k] !== null ? counts[k] : 0;
    h += "<tr" + (n > 0 ? " class='on'" : "") + "><td><span style='display:inline-block;width:10px;" +
         "height:10px;border-radius:2px;margin-right:6px;background:" + COLORS[k] + "'></span>" +
         NAMES[k] + "</td><td>" + n + "</td></tr>";
  }
  h += "<tr><td>Population inside zones</td><td>" + (z.pop || 0).toLocaleString() + "</td></tr>";
  tb.innerHTML = h;

  drawZones();
  updateLegend();
  buildClock();
  drawStrip();
  writeHash();
}

/* ---------- clock ---------- */

function buildClock() {
  var days = {};
  cycles.forEach(function (c, i) { var d = c.cycle.slice(6, 8); (days[d] = days[d] || []).push(i); });
  var el = document.getElementById("clock");
  el.innerHTML = "";
  Object.keys(days).sort().forEach(function (d) {
    var row = document.createElement("div"); row.className = "dayrow";
    var lab = document.createElement("div"); lab.className = "day";
    lab.textContent = parseInt(d, 10) + " Aug"; row.appendChild(lab);
    var have = {};
    days[d].forEach(function (i) { have[parseInt(cycles[i].cycle.slice(9, 11), 10)] = i; });
    for (var h = 0; h < 24; h++) {
      var chip = document.createElement("div"); chip.className = "chip";
      chip.textContent = String(h).padStart(2, "0");
      if (have[h] === undefined) { chip.classList.add("gap"); }
      else {
        var i = have[h], c = cycles[i], n = c.zones[bandset].n;
        chip.title = c.label + ", " + n + " zones, p90 max " + c.uq.p90;
        if (n === 0) chip.classList.add("quiet"); else chip.classList.add("wet");
        if (i === idx) chip.classList.add("sel");
        chip.onclick = (function (k) { return function () { idx = k; draw(); }; })(i);
      }
      row.appendChild(chip);
    }
    el.appendChild(row);
  });
}

/* ---------- timeline ---------- */

var strip = document.getElementById("strip");
function stripGeom() { return { W: strip.clientWidth || 1000, H: 130, L: 38, R: 30, T: 10, B: 36 }; }

function drawStrip() {
  var G = stripGeom(), W = G.W, H = G.H, L = G.L, R = G.R, T = G.T, Bm = G.B;
  strip.setAttribute("viewBox", "0 0 " + W + " " + H);
  var hours = cycles.map(cycleHour), hMax = hours[hours.length - 1];
  var x = function (h) { return L + h / hMax * (W - L - R); };
  var a = cycles.map(function (c) { return c.uq.p90; });
  var b = cycles.map(function (c) { return c.ss.max; });
  var uTop = Math.max(1.5, Math.ceil(Math.max(Math.max.apply(null, a), Math.max.apply(null, b)) * 2) / 2);
  var y = function (u) { return T + (1 - u / uTop) * (H - T - Bm); };
  var g = "<rect x='" + x(24) + "' y='" + T + "' width='" + (x(48) - x(24)) + "' height='" +
          (H - T - Bm) + "' fill='#f5f7fa'/>";
  for (var u = 0; u <= uTop + 0.001; u += 0.5) {
    g += "<line x1='" + L + "' y1='" + y(u) + "' x2='" + (W - R) + "' y2='" + y(u) + "' stroke='#eceff3'/>";
    g += "<text x='" + (L - 7) + "' y='" + (y(u) + 3.5) + "' text-anchor='end' font-size='10' fill='#8b98a5'>" +
         u.toFixed(1) + "</text>";
  }
  var bands = D.bandsets[bandset].bands;
  bands.forEach(function (bv) {
    if (bv <= uTop) {
      g += "<line x1='" + L + "' y1='" + y(bv) + "' x2='" + (W - R) + "' y2='" + y(bv) +
           "' stroke='#c3ccd4' stroke-dasharray='2,3'/>";
    }
  });
  g += "<line x1='" + L + "' y1='" + y(1) + "' x2='" + (W - R) + "' y2='" + y(1) + "' stroke='#9aa7b3'/>";
  g += "<text x='" + (W - R - 4) + "' y='" + (y(1) - 4) + "' text-anchor='end' font-size='10' fill='#8b98a5'>FIM trigger 1.0</text>";
  for (var h = 0; h <= hMax; h += 6) {
    var xi = x(h), mid = h % 24 === 0;
    g += "<line x1='" + xi + "' y1='" + (H - Bm) + "' x2='" + xi + "' y2='" + (H - Bm + (mid ? 7 : 4)) + "' stroke='#b7c2cc'/>";
    if (mid) g += "<line x1='" + xi + "' y1='" + T + "' x2='" + xi + "' y2='" + (H - Bm) + "' stroke='#d4dce4'/>";
    g += "<text x='" + xi + "' y='" + (H - Bm + 17) + "' text-anchor='middle' font-size='10' fill='#8b98a5'>" +
         String(h % 24).padStart(2, "0") + ":00</text>";
  }
  g += "<text x='" + x(12) + "' y='" + (H - 3) + "' text-anchor='middle' font-size='11' font-weight='600' fill='#5b6770'>16 August 2026</text>";
  g += "<text x='" + x(36) + "' y='" + (H - 3) + "' text-anchor='middle' font-size='11' font-weight='600' fill='#5b6770'>17 August 2026</text>";
  function poly(vals, color, dash) {
    var pts = "";
    vals.forEach(function (v, i) { pts += x(hours[i]).toFixed(1) + "," + y(v).toFixed(1) + " "; });
    return "<polyline points='" + pts + "' fill='none' stroke='" + color + "' stroke-width='2'" +
           (dash ? " stroke-dasharray='5,4'" : "") + " stroke-linejoin='round'/>";
  }
  g += poly(a, "#2b6ca3", false) + poly(b, "#b3541e", true);
  var cx = x(hours[idx]);
  g += "<line x1='" + cx + "' y1='" + (T - 4) + "' x2='" + cx + "' y2='" + (H - Bm) + "' stroke='#1a2733' stroke-width='2.4'/>";
  g += "<circle cx='" + cx + "' cy='" + y(a[idx]) + "' r='4' fill='#2b6ca3' stroke='#fff' stroke-width='2'/>";
  strip.innerHTML = g;
}

function stripIndexFromEvent(e) {
  var r = strip.getBoundingClientRect(), G = stripGeom();
  var fx = (e.clientX - r.left) / r.width * G.W;
  var hours = cycles.map(cycleHour), hMax = hours[hours.length - 1];
  var h = (fx - G.L) / (G.W - G.L - G.R) * hMax, best = 0, bd = 1e9;
  hours.forEach(function (hh, i) { var d = Math.abs(hh - h); if (d < bd) { bd = d; best = i; } });
  return best;
}
strip.addEventListener("click", function (e) { idx = stripIndexFromEvent(e); draw(); });
strip.addEventListener("mousemove", function (e) {
  var i = stripIndexFromEvent(e), c = cycles[i], G = stripGeom();
  var hours = cycles.map(cycleHour);
  tip.style.display = "block";
  tip.style.left = ((G.L + hours[i] / hours[hours.length - 1] * (G.W - G.L - G.R)) / G.W * strip.clientWidth) + "px";
  tip.style.top = "14px";
  tip.textContent = c.label + " UTC. Forecast p90 " + c.uq.p90 + ", QPE member max " + c.ss.max +
    " m3/s/km2, " + c.zones[bandset].n + " zones.";
});
strip.addEventListener("mouseleave", function () { tip.style.display = "none"; });

/* ---------- controls ---------- */

cycles.forEach(function (c, i) {
  var o = document.createElement("option"); o.value = i; o.textContent = c.label;
  sel.appendChild(o);
});
sel.onchange = function () { idx = parseInt(sel.value, 10); draw(); };

document.querySelectorAll("#seg-view button").forEach(function (b) {
  b.onclick = function () {
    view = b.dataset.v;
    document.querySelectorAll("#seg-view button").forEach(function (o) { o.classList.toggle("on", o === b); });
    draw();
  };
});
document.querySelectorAll("#seg-band button").forEach(function (b) {
  b.onclick = function () {
    bandset = b.dataset.b;
    document.querySelectorAll("#seg-band button").forEach(function (o) { o.classList.toggle("on", o === b); });
    document.getElementById("bandnote").textContent = D.bandsets[bandset].label +
      ": " + D.bandsets[bandset].bands.join(", ") + " m3/s per km2.";
    draw();
  };
});
var fsel = document.getElementById("fieldsel");
Object.keys(FIELDS).forEach(function (k) {
  var o = document.createElement("option"); o.value = k; o.textContent = FIELDS[k].label;
  fsel.appendChild(o);
});
fsel.value = field;
fsel.onchange = function () { field = fsel.value; draw(); };

var zt = document.getElementById("zonetoggle");
zt.onclick = function () {
  zt.classList.toggle("on");
  if (zoneLayer) { zt.classList.contains("on") ? zoneLayer.addTo(map) : map.removeLayer(zoneLayer); }
};
var at = document.getElementById("aoctoggle");
at.onclick = function () {
  at.classList.toggle("on");
  if (aocLayer) { at.classList.contains("on") ? aocLayer.addTo(map) : map.removeLayer(aocLayer); }
};
document.getElementById("prev").onclick = function () { idx = Math.max(idx - 1, 0); draw(); };
document.getElementById("next").onclick = function () { idx = Math.min(idx + 1, cycles.length - 1); draw(); };
document.addEventListener("keydown", function (e) {
  if (e.key === "ArrowRight") { idx = Math.min(idx + 1, cycles.length - 1); draw(); }
  if (e.key === "ArrowLeft") { idx = Math.max(idx - 1, 0); draw(); }
});
document.getElementById("play").onclick = function () {
  var self = this;
  if (playing) { clearInterval(playing); playing = null; self.textContent = "Play"; self.classList.remove("on"); return; }
  self.textContent = "Pause"; self.classList.add("on");
  playing = setInterval(function () {
    idx = (idx + 1) % cycles.length; draw();
    if (idx === cycles.length - 1) {
      clearInterval(playing); playing = null; self.textContent = "Play"; self.classList.remove("on");
    }
  }, 800);
};

window.addEventListener("resize", drawStrip);

readHash();
buildMap();
document.querySelectorAll("#seg-view button").forEach(function (o) { o.classList.toggle("on", o.dataset.v === view); });
document.querySelectorAll("#seg-band button").forEach(function (o) { o.classList.toggle("on", o.dataset.b === bandset); });
document.getElementById("bandnote").textContent = D.bandsets[bandset].label + ": " +
  D.bandsets[bandset].bands.join(", ") + " m3/s per km2.";
draw();

/* a shared link whose address is pasted while the page is already open should
   still move the view */
window.addEventListener("hashchange", function () {
  readHash();
  draw();
});
