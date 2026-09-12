/* Reported impacts layer, shared by the three Barbados viewers (FIM, flood potential, IBF).
   Loaded after the viewer's own script on an event page, together with data/impacts.js
   (window.IMPACTS, built by the impacts table of the event). Expects the page's Leaflet map in
   the global variable "map", which all three viewers create synchronously at load.

   Draws every mapped record as a circle marker coloured by category (flooding, wind damage,
   observation), a dashed circle for parish or district level records, a popup with the
   description and the sources, and a small control at the top right with the category
   toggles, the island summary and the CSV link. */
"use strict";
(function () {
  var I = window.IMPACTS;
  if (!I || !I.features || typeof map === "undefined" || !map) return;
  var COL = { flood: "#1f5fbf", wind: "#7a5195", observation: "#2a9d8f" };
  var LABEL = { flood: "Flooding", wind: "Wind damage", observation: "Observations" };
  var feats = I.features.features.filter(function (f) { return f.properties.mapped; });
  var summary = I.features.features.filter(function (f) { return !f.properties.mapped; });
  if (!feats.length) return;

  map.createPane("impacts");
  map.getPane("impacts").style.zIndex = 650;
  var groups = { flood: L.layerGroup(), wind: L.layerGroup(), observation: L.layerGroup() };
  var counts = { flood: 0, wind: 0, observation: 0 };

  function esc(s) { return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function popup(p) {
    var h = "<b>" + esc(p.place) + "</b><div style='color:#5b6770;margin-bottom:4px'>" + esc(p.parish) +
      " | " + esc(p.category_label) + " | " + esc(p.date_utc) +
      (p.precision !== "point" ? " | " + esc(p.precision) + " level, " + p.radius_km + " km radius" : "") + "</div>";
    h += "<div style='font-weight:600;margin-bottom:4px'>" + esc(p.impact) + "</div>";
    h += "<div>" + esc(p.description) + "</div>";
    h += "<div style='margin-top:6px;color:#5b6770'>Confidence " + esc(p.confidence).toLowerCase() + ". Sources:</div><ul style='margin:2px 0 0 16px;padding:0'>";
    (p.sources || []).forEach(function (s) {
      h += "<li>" + (s.url ? "<a href='" + esc(s.url) + "' target='_blank' rel='noopener'>" + esc(s.name) + "</a>" : esc(s.name)) + "</li>";
    });
    return h + "</ul>";
  }

  feats.forEach(function (f) {
    var p = f.properties, ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    var g = groups[p.category] || groups.flood;
    counts[p.category] = (counts[p.category] || 0) + 1;
    if (p.radius_km > 0) {
      g.addLayer(L.circle(ll, { pane: "impacts", radius: p.radius_km * 1000, color: COL[p.category],
        weight: 1.5, dashArray: "5,4", fill: true, fillColor: COL[p.category], fillOpacity: 0.06, interactive: false }));
    }
    var m = L.circleMarker(ll, { pane: "impacts", radius: 7, color: "#ffffff", weight: 2,
      fillColor: COL[p.category], fillOpacity: 0.95 });
    m.bindTooltip(p.place + ": " + p.impact, { sticky: true });
    m.bindPopup(popup(p), { maxWidth: 340 });
    g.addLayer(m);
  });
  Object.keys(groups).forEach(function (k) { if (counts[k]) groups[k].addTo(map); });

  var ctl = L.control({ position: "topright" });
  ctl.onAdd = function () {
    var d = L.DomUtil.create("div", "map-legend");
    d.style.maxWidth = "232px";
    var h = "<b>Reported impacts, Tomas 2010</b>";
    Object.keys(groups).forEach(function (k) {
      if (!counts[k]) return;
      h += "<label style='display:block;cursor:pointer'><input type='checkbox' checked data-k='" + k +
        "' style='vertical-align:-1px;margin:0 5px 0 0'><i style='background:" + COL[k] +
        ";border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px " + COL[k] + "'></i>" +
        LABEL[k] + " (" + counts[k] + ")</label>";
    });
    h += "<div style='margin-top:4px;color:#5b6770'>Dashed circle: parish or district level record. " +
      "Click a point for the report and its sources.</div>";
    h += "<div style='margin-top:4px'><a href='#' data-act='summary'>Island summary</a> &nbsp; " +
      "<a href='" + (I.csv || "data/impacts_tomas2010.csv") + "' download>Download CSV</a></div>";
    d.innerHTML = h;
    L.DomEvent.disableClickPropagation(d);
    L.DomEvent.disableScrollPropagation(d);
    d.querySelectorAll("input[data-k]").forEach(function (cb) {
      cb.onchange = function () {
        var g = groups[cb.dataset.k];
        if (cb.checked) g.addTo(map); else map.removeLayer(g);
      };
    });
    var a = d.querySelector("a[data-act=summary]");
    if (a) a.onclick = function (e) {
      e.preventDefault();
      var h2 = "<b>" + esc(I.event) + "</b>";
      summary.forEach(function (f) {
        var p = f.properties;
        h2 += "<div style='margin-top:6px;font-weight:600'>" + esc(p.impact) + "</div><div>" + esc(p.description) + "</div>";
        h2 += "<div style='color:#5b6770;margin-top:3px'>Sources: " + (p.sources || []).map(function (s) {
          return s.url ? "<a href='" + esc(s.url) + "' target='_blank' rel='noopener'>" + esc(s.name) + "</a>" : esc(s.name);
        }).join("; ") + "</div>";
      });
      h2 += "<div style='margin-top:6px;color:#5b6770'>" + esc(I.note) + "</div>";
      L.popup({ maxWidth: 420 }).setLatLng(map.getCenter()).setContent(h2).openOn(map);
    };
    return d;
  };
  ctl.addTo(map);
})();
