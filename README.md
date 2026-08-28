# UQ Flood Potential: Barbados

Uncertainty quantified flood potential from the TITO EF5 CREST ensemble over the 30 m Barbados
domain, for the hindcast of 16 to 17 August 2026: 48 hourly forecast cycles, each with a
50 member StormLab forecast ensemble and a 10 member STREAM-Sat analysis ensemble.

**Live site:** https://ahwalab.github.io/Barbados_warnings/

Companion products:
[flood maps](https://ahwalab.github.io/Barbados_fim/) and
[impact based forecast](https://ahwalab.github.io/Barbados_IFB/).

The product communicates **flood potential**, not official warnings. Issuing warnings is the
mandate of the national institutions.

## What it shows

Flood potential classes are defined on maximum unit streamflow in m3/s per km2, mapped as the
ensemble 90th percentile and clustered into zones, following the Guatemala design note.

- **View A, hazard.** Zones coloured by flood potential class.
- **View B, impact adjusted.** One level per zone from a likelihood by impact matrix that folds
  in enumeration district population density and proximity to built up areas.

Two class band sets are offered side by side:

| Set | Bands, m3/s per km2 | Purpose |
|---|---|---|
| Guatemala / FLASH | 0.5, 1, 2, 4 | comparable with the Guatemala product |
| Barbados calibrated | 0.25, 0.40, 0.50, 0.70 | readable on this event, where the island peaks at 1.7 |

Background raster fields: per pixel flood potential class, forecast ensemble p5, median and p90,
STREAM-Sat analysis median and member maximum, and the QPE rainfall accumulation.

## Zone rules

A cell carries credible signal when at least 3 of the 50 members exceed the first band. The
signal mask is closed, opened, labelled with 8 connectivity, filtered at a minimum zone area of
0.32 km2 (the Guatemala minimum) and its interior holes are filled. A zone takes the highest
class that covers at least a tenth of it, and reports the worst class present separately, so a
single hot cell cannot set the class of a large zone. Confidence is tiered on the probability of
reaching the first band: HIGH at 50 percent or more, MED 20 to 50, LOW 5 to 20; it drives fill
opacity and a dashed edge at LOW.

## Repository layout

    index.html                 the application, English
    assets/css/style.css       styles
    assets/js/app.js           application logic, plain JavaScript on Leaflet
    assets/vendor/             Leaflet 1.9.4, vendored
    assets/data/cycles.js      per cycle statistics, band definitions, area of concern
    assets/layers/             image overlays, <field>_<cycle>.png, EPSG 4326
    assets/zones/              <bandset>_<cycle>.geojson, loaded on demand

## Two things a reader must know about this run

1. **The forecast rainfall grids are empty.** Every `qpfaccum` raster in every member and every
   cycle is all zeros, so only the analysis rainfall `qpeaccum` is offered as a rainfall layer.
2. **The event is small.** The island peaks at 1.7 m3/s per km2 in the analysis ensemble and
   0.9 in the forecast ensemble. On the Guatemala bands no zone of the minimum area reaches even
   the Low class, which is why the calibrated set exists. Only the Guatemala set is comparable
   with the Guatemala product.

## Basemap key

CARTO raster basemaps have required an API key since August 2026. The key issued to the
University of Iowa sits near the top of `assets/js/app.js` as `CARTO_KEY`, and the light basemap URL is
built from it:

    https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=CARTO_KEY

It is a browser side key, so it is visible in the source by design. CARTO restricts it to
`ahwalab.github.io` and `localhost`, and that restriction is what protects it. To rotate it,
replace the value in that one line, here and in the other two viewer repositories. CARTO and
OpenStreetMap attribution must stay visible on the map, and it is printed in the bottom right
corner of every map.

The satellite layer is Esri World Imagery and needs no key.

## Local preview

    python -m http.server 8000

Then open http://localhost:8000/. Only the basemap tiles need internet.

---

AHWA Laboratory, The University of Iowa. EWS-F project, funded by the WMO.
Training demonstration. Not an operational warning product.
