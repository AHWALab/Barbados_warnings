# UQ Flood Potential: Barbados

Uncertainty quantified flood potential from the TITO EF5 CREST ensemble over the 30 m Barbados
domain, for two demonstration cases on one FLASH class band set.

**Live site:** https://ahwalab.github.io/Barbados_warnings/

| Case | Folder | Cycles | Forecast ensemble | Analysis |
|---|---|---|---|---|
| Hurricane Tomas, 29 to 30 October 2010 | `tomas2010/` | 1, 30 Oct 00:00 UTC, 24 h horizon | 50 members built on the WRF 3 km hindcast rainfall | IMERG warm up to the cycle time |
| Hindcast of 16 to 17 August 2026 | `aug2026/` | 48 hourly | StormLab, 50 members per cycle | STREAM-Sat, 10 members per cycle |

Companion products:
[flood maps](https://ahwalab.github.io/Barbados_fim/) and
[impact based forecast](https://ahwalab.github.io/Barbados_IFB/).

The product communicates **flood potential**, not official warnings. Issuing warnings is the
mandate of the national institutions.

## What it shows

Flood potential classes are defined on maximum unit streamflow in m3/s per km2, mapped as the
ensemble 90th percentile and clustered into zones, following the Guatemala design note. The
class bands are the FLASH set for both cases: under 0.5 No signal, 0.5 to 1 Low, 1 to 2
Moderate, 2 to 4 High, 4 and up Very high. The earlier Barbados calibrated band set has been
retired so that the two cases, and the Guatemala product, read on one scale.

- **View A, hazard.** Zones coloured by flood potential class.
- **View B, impact adjusted.** One level per zone from a likelihood by impact matrix that folds
  in enumeration district population density and proximity to built up areas.

Background raster fields, chosen from the field list of each case: per pixel class (p90, and
for Tomas also the median), forecast ensemble p5, median, p90 and member maximum, analysis
fields where the case has them, probability of reaching a band, rainfall accumulation. The unit
streamflow fields use the FLASH display scale (grey under 1, then 1, 2, 4, 6, 10 and 20 m3/s per
km2; the top bin is white in FLASH and drawn pale violet here so it stays visible on a light
basemap). The rainfall ramp and the probability ramp are the same in both cases.

## Zone rules

A cell carries credible signal when at least 3 of the 50 members exceed the first band. The
signal mask is closed, opened, labelled with 8 connectivity, filtered at a minimum zone area of
0.32 km2 (the Guatemala minimum) and its interior holes are filled. A zone takes the highest
class that covers at least a tenth of it, and reports the worst class present separately, so a
single hot cell cannot set the class of a large zone. Confidence is tiered on the probability of
reaching the first band: HIGH at 50 percent or more, MED 20 to 50, LOW 5 to 20; it drives fill
opacity and a dashed edge at LOW.

## Repository layout

    index.html                    portal, one card per case
    assets/css/style.css          styles, shared by the three Barbados viewers
    assets/js/app.js              the application, one for both cases
    assets/vendor/                Leaflet 1.9.4, vendored
    <case>/index.html             the case page, sets window.EVENT_DIR and its own text
    <case>/data/cycles.js         per cycle statistics, field list, parish table, zone summary
    <case>/layers/                image overlays, <field>_<cycle>.png, EPSG 4326, island window
    <case>/zones/                 gt_<cycle>.geojson, loaded on demand

Both cases share the island window, 1053 by 839 cells at one arc second, north 13.33625,
south 13.04375, west -59.652083, east -59.419028.

## Two things a reader must know

1. **Tomas saturates the bands.** With 229 mm of rain in 24 h on average, the ensemble p90 puts
   98 percent of the land in Very high and the credible signal covers the whole island, so the
   zone product returns one island wide zone. The spatial structure is in the probability of
   reaching 4, the p90 and the member maximum fields, and in the flood maps and impact product.
2. **August 2026 barely reaches the first band.** The island peaks at 1.7 m3/s per km2 in the
   analysis ensemble and 0.9 in the forecast ensemble. No zone reaches Moderate.

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
