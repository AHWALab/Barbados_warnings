/* UQ Flood Potential, Barbados. Leaflet plus plain JavaScript, one application for every
   event folder. The event page sets window.EVENT_DIR and loads its own data/cycles.js
   (window.WARN_DATA). Zones load on demand from <event>/zones/gt_<cycle>.geojson and
   image overlays from <event>/layers/<field>_<cycle>.png.

   Class bands are the FLASH set (0.5, 1, 2, 4 m3/s per km2) for every event. */

"use strict";

var D = window.WARN_DATA;
var EV = window.EVENT_DIR || "";
var cycles = D.cycles;
var LB = D.bounds;
var COLORS = D.class_colors, NAMES = D.class_names, BANDS = D.bands;
var FLASHBAR = ["#CDEFE1", "#8ED8EA", "#46B0C6", "#2B66D9", "#FFE14D", "#FFA22E", "#E85C22", "#A50F0F"];
var FIELDS = {};
D.fields.forEach(function (f) { FIELDS[f.key] = f; });

var idx = D.mode === "cycles" ? 0 : 0, view = "A", field = D.fields[0].key, playing = null;
var map, overlay, zoneLayer, aocLayer;
var zoneCache = {};

var sel = document.getElementById("cycsel");
var tip = document.getElementById("tip");

/* ---------- state in the address ---------- */

function readHash() {
  var h = new URLSearchParams(location.hash.slice(1));
  var c = h.get("c");
  if (c) { var i = cycles.findIndex(function (x) { return x.cycle === c; }); if (i >= 0) idx = i; }
  if (h.get("v") === "A" || h.get("v") === "B") view = h.get("v");
  if (FIELDS[h.get("f")]) field = h.get("f");
}
function writeHash() {
  var h = new URLSearchParams();
  h.set("c", cycles[idx].cycle); h.set("v", view); h.set("f", field);
  history.replaceState(null, "", "#" + h.toString());
}

function cycleHour(c) {
  var d0 = (D.strip && D.strip.day0) || parseInt(cycles[0].cycle.slice(6, 8), 10);
  return (parseInt(c.cycle.slice(6, 8), 10) - d0) * 24 + parseInt(c.cycle.slice(9, 11), 10);
}
function fmt(v, d) { return (v === null || v === undefined) ? "-" : (d === undefined ? v : Number(v).toFixed(d)); }

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
    aocLayer = L.geoJSON(D.aoc, {
      style: { color: "#0d3b5e", weight: D.aoc.features.length > 1 ? 1.2 : 2,
               dashArray: "5,4", fill: false },
      onEachFeature: function (f, l) {
        if (f.properties && f.properties.name) l.bindTooltip(f.properties.name, { sticky: true });
      }
    }).addTo(map);
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

function bandLabels() {
  return ["under " + BANDS[0], BANDS[0] + " to " + BANDS[1], BANDS[1] + " to " + BANDS[2],
          BANDS[2] + " to " + BANDS[3], BANDS[3] + " and up"];
}

function rampHtml(sc) {
  var h = "<div class='rampbox'>";
  sc.colors.forEach(function (c) { h += "<div style='background:" + c + "'></div>"; });
  h += "</div><div class='ramplab'>";
  var lab = sc.labels.slice(0, sc.colors.length + 1);
  lab.forEach(function (l, i) { h += "<span" + (i === lab.length - 1 ? " class='last'" : "") + ">" + l + "</span>"; });
  h += "</div><div class='rampunit'>" + sc.unit + "</div>";
  return h;
}

function updateLegend() {
  var lo = bandLabels();
  var h = "<b>" + (view === "A" ? "Flood potential class" : "Impact adjusted level") + "</b>";
  h += "<div class='flashbar'>" + FLASHBAR.map(function (c) { return "<div style='background:" + c + "'></div>"; }).join("") + "</div>";
  h += "<div class='flashlabels'><b>Low</b><span>Flood potential</span><b>High</b></div>";
  for (var i = 0; i < 5; i++) {
    h += "<div><i style='background:" + COLORS[i] + "'></i>" + NAMES[i] +
         (view === "A" ? ", " + lo[i] : "") + "</div>";
  }
  if (view === "A") h += "<div class='lg-note'>m3/s per km2, ensemble p90</div>";
  var f = FIELDS[field];
  if (f.file && f.scale && f.scale !== "class") {
    h += "<div class='lg-sub'>" + f.label + "</div>" + rampHtml(D.scales[f.scale]);
  } else if (f.scale === "class") {
    h += "<div class='lg-note'>Raster shows the class per pixel; zone fills are " +
         "lightened so both read at once.</div>";
  }
  if (f.file) h += "<div class='lg-note'>Zone fills are lightened while a field is shown. " +
    "Choose None to read the zones alone.</div>";
  var el = document.getElementById("maplegend");
  if (el) el.innerHTML = h;
}

/* ---------- zones ---------- */

function zoneStyle(f) {
  var p = f.properties;
  var k = view === "A" ? p.hazard_class : p.level;
  var lightened = !!FIELDS[field].file;
  return { color: p.confidence === "LOW" ? "#7a8894" : "#33414d",
           weight: p.confidence === "LOW" ? 1 : 1.4,
           dashArray: p.confidence === "LOW" ? "4,3" : null,
           fillColor: COLORS[k],
           fillOpacity: lightened
             ? (p.confidence === "HIGH" ? 0.30 : (p.confidence === "MED" ? 0.20 : 0.12))
             : (p.confidence === "HIGH" ? 0.72 : (p.confidence === "MED" ? 0.58 : 0.42)) };
}

function popupHtml(p) {
  var rows = [
    ["Flood potential class", NAMES[p.hazard_class] +
      (p.share_at_class ? ", over " + p.share_at_class + " percent of the zone" : "")],
    ["Worst class present", NAMES[p.worst_class] + ", " + p.share_worst + " percent of the zone"],
    ["Ensemble p90 inside, p90", p.p90 + " m3/s/km2"],
    ["Ensemble p90 inside, max", (p.p90_max === undefined ? "-" : p.p90_max) + " m3/s/km2"],
    ["P(UQ at or above " + BANDS[0] + "), max", p.prob_band1]];
  if (p.p_ge_4 !== undefined) rows.push(["P(UQ at or above 4), mean", p.p_ge_4]);
  rows = rows.concat([
    ["Confidence", p.confidence],
    ["Impact axis", p.impact_axis],
    ["Impact adjusted level", NAMES[p.level]],
    ["Area", p.area_km2 + " km2"],
    ["Population inside", p.population.toLocaleString()],
    ["Enumeration districts", p.n_eds]]);
  if (p.parishes) rows.push(["Parishes", p.parishes]);
  return "<b>Zone " + p.zone + "</b><table>" + rows.map(function (r) {
    return "<tr><td style='color:#5b6770'>" + r[0] + "</td><td><b>" + r[1] + "</b></td></tr>";
  }).join("") + "</table>";
}

function loadZones(cb) {
  var c = cycles[idx].cycle;
  if (zoneCache[c]) { cb(zoneCache[c]); return; }
  fetch(EV + "zones/gt_" + c + ".geojson")
    .then(function (r) { return r.json(); })
    .then(function (j) { zoneCache[c] = j; cb(j); })
    .catch(function () { cb({ type: "FeatureCollection", features: [] }); });
}

function drawZones() {
  loadZones(function (j) {
    if (zoneLayer) map.removeLayer(zoneLayer);
    zoneLayer = L.geoJSON(j, {
      style: zoneStyle,
      onEachFeature: function (f, l) { l.bindPopup(popupHtml(f.properties), { maxWidth: 320 }); }
    });
    if (document.getElementById("zonetoggle").classList.contains("on")) zoneLayer.addTo(map);
    var n = j.features.length;
    document.getElementById("zonecount").textContent = n === 0
      ? "No zone reaches the reporting threshold in this cycle."
      : n + " zone" + (n === 1 ? "" : "s") + " mapped.";
  });
}

/* ---------- side panel ---------- */

function kvRows(c) {
  var rows = [];
  rows.push(["Forecast p90, island max", c.uq.p90 + " m3/s/km2"]);
  rows.push(["Forecast median, island max", c.uq.p50 + " m3/s/km2"]);
  rows.push(["Forecast member maximum", c.uq.max + " m3/s/km2"]);
  if (c.uq.p90_mean !== undefined) rows.push(["Forecast p90, island mean", c.uq.p90_mean + " m3/s/km2"]);
  if (c.ss) rows.push(["STREAM-Sat member max", c.ss.max + " m3/s/km2"]);
  if (c.analysis) rows.push(["Warm up only, no forecast rain", c.analysis.max + " m3/s/km2"]);
  if (c.rain) {
    rows.push(["Rainfall, island mean", c.rain.mean + " mm"]);
    rows.push(["Rainfall, maximum", c.rain.max + " mm"]);
    if (c.rain.member_mean_range) rows.push(["Member island means",
      c.rain.member_mean_range[0] + " to " + c.rain.member_mean_range[1] + " mm"]);
  }
  if (c.prob) {
    if (c.prob.p_ge_4_mean !== undefined) rows.push(["P(UQ at or above 4), mean", c.prob.p_ge_4_mean]);
    if (c.prob.share_ge05 !== undefined) rows.push(["Credible signal", c.prob.share_ge05 + " percent of land"]);
  }
  if (c.fim) {
    if (c.fim.parishes_triggered !== undefined) {
      rows.push(["FIM trigger", c.fim.parishes_triggered + " of 11 parishes, max " + c.fim.max_uq]);
    } else {
      rows.push(["Saint Thomas FIM trigger", (c.fim.max_uq === null || c.fim.max_uq === undefined ? "-" : c.fim.max_uq) + " m3/s/km2"]);
    }
  }
  var z = c.zones.gt;
  rows.push(["Credible signal area", ((z.signal && z.signal.area_km2) || 0) + " km2"]);
  rows.push(["Zones mapped", z.n]);
  return rows;
}

function parishTable(c) {
  var el = document.getElementById("parishtable");
  if (!el || !c.parishes) return;
  var ps = c.parishes.slice().sort(function (a, b) { return b.p90_max - a.p90_max; });
  var h = "<tr><th>Parish</th><th>p90 max</th><th>p50 max</th><th>Highest class, share</th>";
  var hasP4 = ps[0].p_ge_4 !== undefined;
  h += hasP4 ? "<th>P(4+)</th>" : "<th>P(0.5+)</th>";
  if (ps[0].fim_status !== undefined) h += "<th>FIM wet</th>";
  h += "</tr>";
  ps.forEach(function (p) {
    var top = p.cls_top;
    h += "<tr><td>" + p.name + "</td><td>" + fmt(p.p90_max, 1) + "</td><td>" + fmt(p.p50_max, 1) +
         "</td><td><span class='sw' style='background:" + COLORS[top] + "'></span>" + NAMES[top] +
         " " + p.cls_share[top] + "%</td>";
    h += "<td>" + fmt(hasP4 ? p.p_ge_4 : p.p_ge_05, 2) + "</td>";
    if (p.fim_status !== undefined) {
      h += "<td>" + (p.fim_status === "triggered" ? p.fim_wet_km2 + " km2" : "quiet") + "</td>";
    }
    h += "</tr>";
  });
  el.innerHTML = h;
}

/* ---------- draw ---------- */

function draw() {
  var c = cycles[idx];
  if (sel) sel.value = idx;
  document.getElementById("cyctitle").textContent = "Cycle " + c.cycle +
    (c.horizon ? ", " + c.horizon : "");
  var badge = document.getElementById("badge");
  if (c.fim && c.fim.status === "triggered") { badge.textContent = "FIM triggered"; badge.className = "badge trig"; }
  else { badge.textContent = "below FIM trigger"; badge.className = "badge quiet"; }

  var f = FIELDS[field];
  if (f.file) {
    overlay.setUrl(EV + "layers/" + f.file + "_" + c.cycle + ".png");
    var el = overlay.getElement(); if (el) el.style.display = "";
  } else {
    var e2 = overlay.getElement(); if (e2) e2.style.display = "none";
  }

  var kv = document.getElementById("kv");
  kv.innerHTML = kvRows(c).map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("");

  var z = c.zones.gt;
  var tb = document.getElementById("sttable");
  var counts = view === "A" ? z.classes : [null].concat(z.levels || []);
  var h = "<tr><th>" + (view === "A" ? "Flood potential class" : "Impact adjusted level") +
          "</th><th>Zones</th><th>Land, p90</th></tr>";
  for (var k = (view === "A" ? 0 : 1); k < 5; k++) {
    var n = counts && counts[k] !== undefined && counts[k] !== null ? counts[k] : 0;
    h += "<tr" + (n > 0 ? " class='on'" : "") + "><td><span class='sw' style='background:" + COLORS[k] + "'></span>" +
         NAMES[k] + "</td><td>" + n + "</td><td>" + (c.cls_share ? c.cls_share[k] + "%" : "-") + "</td></tr>";
  }
  h += "<tr><td>Population inside zones</td><td colspan='2'>" + (z.pop || 0).toLocaleString() + "</td></tr>";
  tb.innerHTML = h;
  parishTable(c);

  drawZones();
  updateLegend();
  if (D.mode === "cycles") buildClock();
  drawStrip();
  writeHash();
}

/* ---------- clock (cycles mode) ---------- */

function buildClock() {
  var days = {};
  cycles.forEach(function (c, i) { var d = c.cycle.slice(6, 8); (days[d] = days[d] || []).push(i); });
  var el = document.getElementById("clock");
  el.innerHTML = "";
  Object.keys(days).sort().forEach(function (d) {
    var row = document.createElement("div"); row.className = "dayrow";
    var lab = document.createElement("div"); lab.className = "day";
    lab.textContent = parseInt(d, 10) + " " + ((D.strip && D.strip.month) || ""); row.appendChild(lab);
    var have = {};
    days[d].forEach(function (i) { have[parseInt(cycles[i].cycle.slice(9, 11), 10)] = i; });
    for (var h = 0; h < 24; h++) {
      var chip = document.createElement("div"); chip.className = "chip";
      chip.textContent = String(h).padStart(2, "0");
      if (have[h] === undefined) { chip.classList.add("gap"); }
      else {
        var i = have[h], c = cycles[i], n = c.zones.gt.n;
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

/* ---------- strip: timeline or member spread ---------- */

var strip = document.getElementById("strip");
function stripGeom() { return { W: strip.clientWidth || 1000, H: 130, L: 38, R: 30, T: 10, B: 36 }; }
function getPath(o, k) { return k.split(".").reduce(function (a, b) { return a === undefined ? a : a[b]; }, o); }

function drawStrip() {
  if (D.strip && D.strip.kind === "members") { drawMemberStrip(); return; }
  var G = stripGeom(), W = G.W, H = G.H, L = G.L, R = G.R, T = G.T, Bm = G.B;
  strip.setAttribute("viewBox", "0 0 " + W + " " + H);
  var hours = cycles.map(cycleHour), hMax = hours[hours.length - 1];
  var x = function (h) { return L + h / hMax * (W - L - R); };
  var series = D.strip.series.map(function (s) { return cycles.map(function (c) { return getPath(c, s.key) || 0; }); });
  var allmax = Math.max.apply(null, series.map(function (s) { return Math.max.apply(null, s); }));
  var uTop = Math.max(1.5, Math.ceil(allmax * 2) / 2);
  var y = function (u) { return T + (1 - u / uTop) * (H - T - Bm); };
  var g = "<rect x='" + x(24) + "' y='" + T + "' width='" + (x(48) - x(24)) + "' height='" +
          (H - T - Bm) + "' fill='#f5f7fa'/>";
  for (var u = 0; u <= uTop + 0.001; u += 0.5) {
    g += "<line x1='" + L + "' y1='" + y(u) + "' x2='" + (W - R) + "' y2='" + y(u) + "' stroke='#eceff3'/>";
    g += "<text x='" + (L - 7) + "' y='" + (y(u) + 3.5) + "' text-anchor='end' font-size='10' fill='#8b98a5'>" +
         u.toFixed(1) + "</text>";
  }
  BANDS.forEach(function (bv) {
    if (bv <= uTop) {
      g += "<line x1='" + L + "' y1='" + y(bv) + "' x2='" + (W - R) + "' y2='" + y(bv) +
           "' stroke='#c3ccd4' stroke-dasharray='2,3'/>";
    }
  });
  if (D.strip.trigger) {
    g += "<line x1='" + L + "' y1='" + y(D.strip.trigger.value) + "' x2='" + (W - R) + "' y2='" + y(D.strip.trigger.value) + "' stroke='#9aa7b3'/>";
    g += "<text x='" + (W - R - 4) + "' y='" + (y(D.strip.trigger.value) - 4) + "' text-anchor='end' font-size='10' fill='#8b98a5'>" + D.strip.trigger.label + "</text>";
  }
  for (var h = 0; h <= hMax; h += 6) {
    var xi = x(h), mid = h % 24 === 0;
    g += "<line x1='" + xi + "' y1='" + (H - Bm) + "' x2='" + xi + "' y2='" + (H - Bm + (mid ? 7 : 4)) + "' stroke='#b7c2cc'/>";
    if (mid) g += "<line x1='" + xi + "' y1='" + T + "' x2='" + xi + "' y2='" + (H - Bm) + "' stroke='#d4dce4'/>";
    g += "<text x='" + xi + "' y='" + (H - Bm + 17) + "' text-anchor='middle' font-size='10' fill='#8b98a5'>" +
         String(h % 24).padStart(2, "0") + ":00</text>";
  }
  (D.strip.days || []).forEach(function (d, i) {
    g += "<text x='" + x(12 + 24 * i) + "' y='" + (H - 3) + "' text-anchor='middle' font-size='11' font-weight='600' fill='#5b6770'>" + d + "</text>";
  });
  function poly(vals, color, dash) {
    var pts = "";
    vals.forEach(function (v, i) { pts += x(hours[i]).toFixed(1) + "," + y(v).toFixed(1) + " "; });
    return "<polyline points='" + pts + "' fill='none' stroke='" + color + "' stroke-width='2'" +
           (dash ? " stroke-dasharray='5,4'" : "") + " stroke-linejoin='round'/>";
  }
  D.strip.series.forEach(function (s, i) { g += poly(series[i], s.color, s.dash); });
  var cx = x(hours[idx]);
  g += "<line x1='" + cx + "' y1='" + (T - 4) + "' x2='" + cx + "' y2='" + (H - Bm) + "' stroke='#1a2733' stroke-width='2.4'/>";
  g += "<circle cx='" + cx + "' cy='" + y(series[0][idx]) + "' r='4' fill='" + D.strip.series[0].color + "' stroke='#fff' stroke-width='2'/>";
  strip.innerHTML = g;
}

var memberOrder = null;
function drawMemberStrip() {
  var G = stripGeom(), W = G.W, H = 150, L = 44, R = 20, T = 12, Bm = 30;
  strip.setAttribute("viewBox", "0 0 " + W + " " + H);
  strip.style.height = H + "px";
  var mem = D.members.slice().sort(function (a, b) { return a.uq_max - b.uq_max; });
  memberOrder = mem;
  var n = mem.length, bw = (W - L - R) / n;
  var uTop = Math.ceil(Math.max.apply(null, mem.map(function (m) { return m.uq_max; })) / 5) * 5;
  var y = function (u) { return T + (1 - u / uTop) * (H - T - Bm); };
  var g = "";
  for (var u = 0; u <= uTop + 0.001; u += 5) {
    g += "<line x1='" + L + "' y1='" + y(u) + "' x2='" + (W - R) + "' y2='" + y(u) + "' stroke='#eceff3'/>";
    g += "<text x='" + (L - 7) + "' y='" + (y(u) + 3.5) + "' text-anchor='end' font-size='10' fill='#8b98a5'>" + u + "</text>";
  }
  BANDS.forEach(function (bv) {
    g += "<line x1='" + L + "' y1='" + y(bv) + "' x2='" + (W - R) + "' y2='" + y(bv) + "' stroke='#c3ccd4' stroke-dasharray='2,3'/>";
  });
  g += "<text x='" + (W - R - 4) + "' y='" + (y(4) - 4) + "' text-anchor='end' font-size='10' fill='#8b98a5'>Very high band, 4</text>";
  mem.forEach(function (m, i) {
    var xi = L + i * bw;
    var k = m.uq_max >= 4 ? 4 : (m.uq_max >= 2 ? 3 : (m.uq_max >= 1 ? 2 : (m.uq_max >= 0.5 ? 1 : 0)));
    g += "<rect class='mbar' data-i='" + i + "' x='" + (xi + 1).toFixed(1) + "' y='" + y(m.uq_max).toFixed(1) +
         "' width='" + Math.max(bw - 2, 1).toFixed(1) + "' height='" + (H - Bm - y(m.uq_max)).toFixed(1) +
         "' fill='" + COLORS[k] + "' stroke='" + (m.member === 1 ? "#1a2733" : "#8a97a3") + "' stroke-width='" + (m.member === 1 ? 2 : 0.6) + "'/>";
  });
  g += "<text x='" + L + "' y='" + (H - 8) + "' font-size='10' fill='#8b98a5'>members sorted by island maximum unit streamflow, m3/s per km2; " +
       "the outlined bar is member 1, the unperturbed WRF rainfall</text>";
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
strip.addEventListener("click", function (e) {
  if (D.strip && D.strip.kind === "members") return;
  idx = stripIndexFromEvent(e); draw();
});
strip.addEventListener("mousemove", function (e) {
  var r = strip.getBoundingClientRect(), G = stripGeom();
  if (D.strip && D.strip.kind === "members") {
    var fx = (e.clientX - r.left) / r.width * G.W;
    var L = 44, R = 20, n = memberOrder.length, bw = (G.W - L - R) / n;
    var i = Math.floor((fx - L) / bw);
    if (i < 0 || i >= n) { tip.style.display = "none"; return; }
    var m = memberOrder[i];
    tip.style.display = "block";
    tip.style.left = ((L + (i + 0.5) * bw) / G.W * strip.clientWidth) + "px";
    tip.style.top = "14px";
    tip.textContent = "Member " + m.member + ": island max " + m.uq_max + " m3/s/km2, mean " + m.uq_mean +
      ", rain mean " + m.rain_mean + " mm, " + m.share_ge4 + " percent of land at 4 or more.";
    return;
  }
  var j = stripIndexFromEvent(e), c = cycles[j];
  var hours = cycles.map(cycleHour);
  tip.style.display = "block";
  tip.style.left = ((G.L + hours[j] / hours[hours.length - 1] * (G.W - G.L - G.R)) / G.W * strip.clientWidth) + "px";
  tip.style.top = "14px";
  tip.textContent = c.label + " UTC. Forecast p90 " + c.uq.p90 + (c.ss ? ", analysis member max " + c.ss.max : "") +
    " m3/s/km2, " + c.zones.gt.n + " zones.";
});
strip.addEventListener("mouseleave", function () { tip.style.display = "none"; });

/* ---------- controls ---------- */

if (sel) {
  cycles.forEach(function (c, i) {
    var o = document.createElement("option"); o.value = i; o.textContent = c.label;
    sel.appendChild(o);
  });
  sel.onchange = function () { idx = parseInt(sel.value, 10); draw(); };
}
document.querySelectorAll("#seg-view button").forEach(function (b) {
  b.onclick = function () {
    view = b.dataset.v;
    document.querySelectorAll("#seg-view button").forEach(function (o) { o.classList.toggle("on", o === b); });
    draw();
  };
});
var fsel = document.getElementById("fieldsel");
D.fields.forEach(function (f) {
  var o = document.createElement("option"); o.value = f.key; o.textContent = f.label;
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
function step(d) { idx = Math.min(Math.max(idx + d, 0), cycles.length - 1); draw(); }
if (document.getElementById("prev")) {
  document.getElementById("prev").onclick = function () { step(-1); };
  document.getElementById("next").onclick = function () { step(1); };
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });
}
if (document.getElementById("play")) {
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
}

window.addEventListener("resize", drawStrip);

readHash();
buildMap();
document.querySelectorAll("#seg-view button").forEach(function (o) { o.classList.toggle("on", o.dataset.v === view); });
fsel.value = field;
document.getElementById("bandnote").textContent = "FLASH class bands: " + BANDS.join(", ") +
  " m3/s per km2, on the ensemble p90.";
draw();

/* a shared link whose address is pasted while the page is already open should
   still move the view */
window.addEventListener("hashchange", function () {
  readHash();
  fsel.value = field;
  draw();
});
