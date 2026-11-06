# Handoff: TRACON 3D — Flight Tracker (Radar Noir)

## Overview
A desktop web app that shows live air traffic in 3D around any airport. The user searches for an airport by ICAO, IATA or city name. The camera centers on that airport over a dark map. Aircraft are drawn as 3D models colored by altitude. Each one has a vertical drop line to the ground and a fading trail of its recent path. The user can click an aircraft to see its details and follow it with the camera.

## About the design files
The files in this bundle are **design references built in HTML**. They show the intended look and behavior. They are not production code to ship as-is. Rebuild the design in a proper app. If there is no existing codebase, use **Vite + TypeScript + three.js**. React is optional and works well for the panels.

- `Flight Tracker 1a.dc.html` — the full UI. Open it in a browser over a local server (e.g. `npx serve .`). All styles are inline, and the exact values are listed below.
- `flight-scene.js` — the three.js scene used by the mockup: map tiles, camera rig, aircraft meshes, trails, drop lines, labels, picking and follow-cam. **Reuse its rendering approach.** **Replace its traffic simulator** (`plan()` / `step()`) with live data.
- `airports.js` — a 40-airport sample list plus the search ranking logic. Production should use the full OurAirports database.
- `support.js` — runtime for the mockup only. Do not port it.

## Fidelity
**High fidelity.** Match the colors, type, spacing and layout exactly. Aircraft models are stand-ins until the user provides GLB files.

## Data (production)
- **Traffic:** OpenSky Network `/api/states/all` with a bounding box of about ±1.5° lat / ±2° lon around the airport. Poll every 10 s (5 s with an account).
  - Run it through a **small backend proxy** to handle CORS, keep the OAuth client credentials server-side, cache responses for each bounding box, and back off when rate-limited (HTTP 429).
  - Use these state-vector fields: `icao24, callsign, longitude, latitude, baro_altitude (m→ft), velocity (m/s→kt), true_track, vertical_rate (m/s→fpm), on_ground`.
  - **Between updates**, move each aircraft forward using its reported speed, heading and vertical rate. Ease toward the new position when the next update arrives, so nothing jumps.
- **Aircraft type / airline:** look up type and operator by `icao24` in the OpenSky aircraft database (or a similar source). Look up the airline from the first 3 letters of the callsign (ICAO airline code).
- **Origin / destination:** use OpenSky `/flights/aircraft` or a callsign route lookup service. Show "—" when unknown.
- **Airports:** OurAirports `airports.csv` + `runways.csv`. Index them for search (ICAO, IATA, name, city) and draw real runways using their threshold coordinates. If an airport has no runway data, draw the fallback layout from `normAirport()` in `flight-scene.js`.
- **Category:** label each aircraft ARR (arriving), DEP (departing) or OVR (overflying).
  - ARR: descending, within 40 NM and heading toward the airport (or its destination matches).
  - DEP: climbing and moving away, or its origin matches.
  - OVR: everything else above FL250.
- **Phase label:** Takeoff roll · Initial climb · Climb · Cruise · Descent · Approach · Final approach · Landing. Thresholds are in `phase()` in `flight-scene.js`.

## 3D scene
- **World units:** 1 unit = 1 km, laid out east/north around the airport (+X = east, −Z = north). **Altitude is shown 3× taller than real scale** (`alt_ft × 0.0003048 × 3`).
- **Ground**
  - CARTO `dark_nolabels` raster tiles, zoom 10, 7×7 tiles around the airport (`https://{a-d}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png`). Brighten the tiles slightly by multiplying their color by (1.25, 1.4, 1.6) R/G/B. Credit "© OpenStreetMap contributors © CARTO" on screen.
  - Background `#050608`, with fog `#050608` from 130 to 300 units.
  - Grid every 10 km in `#10181f` at 60% opacity.
  - Range rings at 10/20/30/40 NM in `#24323f`. Label them "10 NM" etc. at bearing 150° in IBM Plex Mono 500 10px `#5b6f80`. Add N/E/S/W markers at 80 km in Plex Mono 600 11px.
  - Runways are white `#dfe7ef` boxes 110 m wide. Draw dashed approach lines (`#ffffff` at 35%, 22 km long) from each active landing threshold.
- **Aircraft**
  - Load a GLB for each class: `narrow` (A320/B737 family), `wide` (B787/A330/A350/B777), `quad` (B747/A380), `regional` (E-jets/CRJ), `prop` (DHC-8/ATR). Use the stand-in low-poly shapes from `geos()` when a model is missing. The nose points −Z.
  - Material: `MeshStandardMaterial` with color and emissive both set to the aircraft's altitude color. Emissive intensity 0.55, roughness 0.45, flat shading. Lighting is a hemisphere light (`#bfd8ff` / `#101418`, 1.1) plus a directional light (1.6).
  - Orientation: yaw follows heading, pitch follows climb angle (capped at ±0.4 rad), and roll follows turn rate (capped at ±0.6 rad, smoothed).
  - Scale models with camera distance (`clamp(dist/50, 0.25, 4)`) so they stay readable when zoomed out.
- **Altitude color scale:** blend smoothly between these points.

  | ft | hex |
  |---|---|
  | 0 | `#ffb020` |
  | 5,000 | `#b6f03c` |
  | 12,000 | `#2ff0c0` |
  | 22,000 | `#3cb8ff` |
  | 32,000 | `#9a7bff` |
  | 42,000+ | `#ff5ad8` |
- **Per aircraft**
  - A vertical drop line to the ground in its altitude color at 45% opacity.
  - A ring on the ground beneath it (inner radius 0.35, outer 0.55, scaled with the model) at 70% opacity.
  - A trail of up to 80 points, one added every 2 s. Each point keeps the color for its own altitude. Fade it toward the tail with brightness `0.08 + 0.92·t²`.
- **Label above each aircraft** (HTML overlay positioned on screen): placed 10 px right of and 8 px above the aircraft. Background `rgba(5,6,8,.8)`, 1px `rgba(255,255,255,.1)` border (white when selected), radius 3, padding 3/6. Text is IBM Plex Mono 600 11px: callsign in white, then flight level (e.g. `087`) in the altitude color followed by ↑ or ↓ when climbing or descending more than 300 fpm.
- **Selected aircraft:** a white ring that faces the camera and pulses (scale 1.05 ± 0.06, 220 ms period). Draw its planned path to the destination as a white dashed line at 70% opacity (dash 1.2 / gap 0.9). With live data, use the projected track or the line to the destination runway.

## Camera
- Orbit camera around a target point, FOV 40°. Default view: theta 0.55, phi 0.98, distance 100.
- **Mouse controls**
  - Drag: orbit (phi clamped to 0.06–1.5).
  - Right-drag or shift-drag: pan.
  - Scroll: zoom (distance 3–320).
  - Click (moving under 5 px): select the nearest aircraft within 28 px on screen, or clear the selection.
- **Easing:** all camera changes ease with `1 − e^(−6·dt)`.
- **Follow-cam:** the target tracks the selected aircraft (faster easing, `1 − e^(−10·dt)`) and the distance is reduced to 18 or less. Panning cancels follow-cam.
- **View buttons:** Overview = default view. Top = phi 0.06, distance 150. Side = phi 1.45, distance 110.

## Screen layout (one full-viewport screen; design size 1440×900, minimum height 720)
The 3D canvas fills the viewport. All panels float on top of it, 20 px from the edges.

### Design tokens
- **Colors**
  - Background `#050608`
  - Panel `rgba(7,9,12,.88)` (details card `.9`, search dropdown `.96`), with `backdrop-filter: blur(10px)`
  - Panel border `#1a232c`; control border `#24303b`
  - Divider inside lists `#10161c`
  - Tile/stat cell background `#07090c`
  - Text: primary `#e8edf2`, strong `#ffffff`, secondary `#8a98a6`, labels `#6b7a89`, body text in empty state `#c4ced8`
  - Accent / live `#2ff0c0`
  - Selected list row `rgba(255,255,255,.08)`; hovered row `rgba(255,255,255,.05)`
  - Progress track `#1f2a34`
- **Type:** IBM Plex Sans Condensed (400/500/600/700) for names and body text. IBM Plex Mono (400/500/600) for all data, labels and controls.
  - Small caps labels: Mono 600, 9–10px, letter-spacing .12–.14em, `#6b7a89`
- **Radius:** panels 6, search 5, controls 4, chips 3
- **Shadows:** none

### Top bar (top 20, left/right 20, flex, space-between, vertically centered)
- **Left group (gap 22)**
  1. **Logo:** a 10×10 `#2ff0c0` square rotated 45°, then "TRACON 3D" in Plex Sans Condensed 700 14px, letter-spacing .18em.
  2. **Airport search** (replaces the tabs from the earlier exploration), 300 px wide:
     - Field: 36 px tall, panel background, 1px border (`#1a232c`, or `#2ff0c0` when focused), radius 5, padding 0 10 0 12, gap 10.
     - Contents: an "ICAO" label (Mono 600 9px, .14em, `#6b7a89`) · the text input (Mono 500 13px, white, letter-spacing .04em, placeholder "Search ICAO, IATA or city" in `#5b6f80`) · a "/" key hint (1px `#24303b` border, radius 3, Mono 10px).
     - **Dropdown:** 42 px below the field top, full width, background `rgba(7,9,12,.96)`, 1px `#24303b` border, radius 5, padding 4. Up to 8 results.
       - Each row is a grid of `44px 34px 1fr`, gap 10, padding 9/10, radius 3: ICAO (Mono 600 13 white) · IATA (Mono 500 11 `#2ff0c0`) · "Name · City" (Sans Condensed 500 12 `#8a98a6`, cut off with an ellipsis).
       - The highlighted row has background `rgba(47,240,192,.12)`.
       - When nothing matches, show `No airport matches "q"` (Mono 12 `#6b7a89`).
  3. **Current airport:** name (Sans Condensed 600 14px), with "CYVR · 49.19°N 123.18°W" below it (Mono 500 10px `#6b7a89`, .04em), gap 4.
- **Right group (gap 18, Mono 500 11px, .06em)**
  - Live status: a 7 px `#2ff0c0` dot with a 3 px `rgba(47,240,192,.2)` glow ring, then "LIVE · OPENSKY ADS-B" in `#2ff0c0`. Production should switch this to a stale or error state (e.g. amber `#ffb020` "DELAYED", red "OFFLINE") when updates fail.
  - UTC clock `HH:MM:SS UTC` in `#8a98a6`.

### Traffic list (left panel: top 76, bottom 20, width 300)
- **Header** (padding 16/16/12): "TRAFFIC" label on the left, "N aircraft" (Mono 500 11 `#8a98a6`) on the right.
- **Counts:** 3 cells (ARR / DEP / OVR) separated by 1 px gaps in `#1a232c`, margin 0 16 14. Each cell has padding 9/10: label (Mono 600 9px) above the number (Mono 600 16px).
- **List:** scrolls, with a top border. Sorted by altitude, highest first.
  - Each row: padding 10/16, bottom border `#10161c`, grid of `1fr auto`.
  - Left side: callsign (Mono 600 13 white) + type (Mono 500 10 `#6b7a89`), with "ORIG → DEST" below (Mono 500 11 `#8a98a6`).
  - Right side: altitude rounded to the nearest 100 ft, or "GND" (Mono 600 13, in the altitude color), with vertical speed below it ("↑ 1,800" / "↓ 900" / "level", Mono 500 10 `#6b7a89`).
  - Clicking a row selects that aircraft. Clicking the selected row clears the selection.

### Details card (right panel: top 76, width 320, padding 18, gap 18)
- **Empty state:** "NO AIRCRAFT SELECTED" label, then "Click an aircraft or a list row to see its details and follow it with the camera." (Sans Condensed 400 14/1.4 `#c4ced8`).
- **When an aircraft is selected:**
  - Callsign (Mono 600 28 white) with "Airline · TYPE" below (Sans Condensed 500 13 `#8a98a6`). A ✕ close button (28×28, 1px `#24303b`, radius 4) sits top-right.
  - Phase chip: Mono 600 10px, .1em, text `#050608` on the altitude color, padding 5/8, radius 3. Text is the phase in uppercase.
  - Route: ORIG and DEST at the two ends (Mono 600 22px). Below them, a 2 px progress bar (track `#1f2a34`, fill in the altitude color). Below that, the ETA line (Mono 500 11 `#8a98a6`): "Touchdown at YVR in ~12 min" for arrivals, "Leaves the YVR area in ~8 min" for others.
  - Stats grid: 2 columns × 3 rows with 1 px gaps in `#1a232c`, radius 4. Each cell has padding 12: label (Mono 600 9) above the value (Mono 600 18). Cells:
    - ALTITUDE ("12,400 ft", in the altitude color)
    - VERTICAL ("+1,800 fpm" / "−900 fpm" / "Level")
    - GROUND SPEED ("287 kt")
    - HEADING ("084°")
    - DISTANCE ("14.2 NM", from the airport)
    - ICAO24
  - Follow button: full width, padding 12, 1px `#e8edf2` border, radius 4, Mono 600 11 .14em.
    - Off: transparent background with `#e8edf2` text, "FOLLOW WITH CAMERA".
    - On: `#e8edf2` background with `#050608` text, "FOLLOWING · CLICK TO RELEASE".

### Legend and view buttons (right 20, bottom 20, width 320, padding 14/16, gap 12)
- Header row: "ALTITUDE · FT" on the left, "VERTICAL ×3" on the right.
- 6 px color bar: `linear-gradient(90deg,#ffb020 0%,#b6f03c 12.5%,#2ff0c0 30%,#3cb8ff 55%,#9a7bff 80%,#ff5ad8 100%)`.
- Tick labels 0 / 10k / 20k / 30k / 40k (Mono 500 10 `#8a98a6`).
- 3 buttons (OVERVIEW / TOP / SIDE) in a 3-column grid, gap 4. Each has padding 8, 1px `#24303b` border, radius 3, Mono 600 10 .1em, text `#c4ced8`. On hover the border and text become white.

## Interactions and state
- **Search**
  - Typing filters results live, ranked as: exact ICAO/IATA match → ICAO/IATA starts with the query → city starts with the query → name or city contains the query.
  - ↑/↓ moves the highlight, Enter picks the highlighted airport, Esc clears and closes, and clicking a result picks it.
  - Pressing "/" anywhere focuses the search field.
  - Picking an airport clears the selection, turns off follow-cam, rebuilds the map tiles and runways, resets the camera and starts a new traffic poll for the new bounding box.
  - Keep the last airport in the URL (`?apt=CYVR`) and in localStorage.
- **App state:** `airport`, `aircraft[]` (keyed by icao24), `selectedId`, `follow`, `query`, `highlightIndex`, `feedStatus` (live / delayed / offline).
- **Lost aircraft:** remove an aircraft after it has had no update for 60 s. If it was selected, clear the selection.
- **Refresh rate:** update the list and details card at about 2 Hz. The 3D scene renders every frame. Pause rendering when the tab is hidden.
- **Performance:** 60 fps with 300 aircraft.
  - Reuse geometry for each aircraft class.
  - Use one trail buffer per aircraft (fixed size, written in place, with a draw range).
  - Hide labels that are behind the camera.
  - Optionally hide labels beyond about 120 km, except for the selected aircraft.

## Assets
- **Fonts:** IBM Plex Sans Condensed and IBM Plex Mono (Google Fonts).
- **Map tiles:** CARTO dark basemap (OSM data). Requires on-screen credit.
- **Aircraft GLBs:** to be supplied by the user. Normalize each to about 1 unit long, nose pointing −Z.
- No icons or images are used. The ✕ and arrows are plain text characters.
