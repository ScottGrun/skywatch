# Agent rules — SkyWatch flight tracker

`design/` is the design handoff (reference only; never edit, never import from it). `design/README.md` is the authoritative spec for look and behavior; match colors/type/spacing exactly. `design/flight-scene.js` is the rendering approach to port (replace its simulator with live data). `design/support.js` is mockup runtime — ignore.

## Stack

pnpm · Vite · React 19 · TypeScript (strict) · three.js · Cloudflare Worker (via `@cloudflare/vite-plugin`, runs locally with no account) as the API proxy · Vitest.

## Layout

- `src/types.ts` — shared contracts (Airport, Aircraft, TrafficSource, FlightScene). Do not change shapes without updating all layers.
- `src/core/` — pure logic, no React/three/DOM: geo math, altitude color ramp, category/phase classification, dead reckoning, airport search ranking, airline lookup, type→class mapping. Unit tested.
- `src/data/` — browser data layer: airport index loading, traffic polling via `/api/*`, `TrafficSource` implementation, route/type enrichment.
- `src/scene/` — three.js only (no React). `createFlightScene(container): FlightScene`. Tuning values in `src/scene/constants.ts`.
- `src/ui/` — React panels (top bar, search, traffic list, details card, legend). 2D only.
- `src/App.tsx` — wires everything; owns app state (airport, selectedId, follow).
- `worker/` — Cloudflare Worker: `/api/states?lamin&lomin&lamax&lomax` (compact JSON + `source`, `pollMs`), `/api/aircraft/:icao24` (adsbdb: type, full type name, owner, airport-data photo URLs), `/api/photo/:icao24` (planespotters fallback photo, 24 h cache) and `/api/route/:callsign` (adsbdb), `/api/track/:icao24` (current-flight history), `/api/airspace?lat&lon&radiusNm` (optional controlled-airspace volumes, US only: FAA Class_Airspace B/C/D, public domain; outside the US `reason: outside_us` — openAIP was dropped because its API WAF-blocks geo queries; cached 24 h; UI toggle in Legend, off by default). Caches, backs off on 429/5xx. `TRAFFIC_SOURCE` env var picks the traffic provider: `adsblol` (default; api.adsb.lol point endpoint, 5 s polling, tracks from adsb.lol readsb trace files `adsb.lol/data/traces/<hex[-2:]>/trace_full_<hex>.json` merged with `trace_recent_`) or `opensky` (needs `.dev.vars`; OpenSky does not answer from Cloudflare's network, so use it for local dev only). Feed also passes `t` (ICAO type), `r` (registration) and emitter `category` (ADS-B "A3" string or OpenSky number); the client prefers `t`/`r` over the baked DB/adsbdb.
- Data source: adsb.lol, ODbL 1.0, open API with no key (optional key on request), no published rate limit. UI shows "Data: adsb.lol (ODbL)" attribution. adsbdb works from Cloudflare.
- `scripts/build-airports.ts` — downloads OurAirports CSVs → `public/data/airports.json`.
- `scripts/bake-logos.ts` (`pnpm bake:logos`) — airline tail-icon logos from Jxck-S/airline-logos (`flightaware_logos`, named by ICAO code; curated list in `scripts/logoCodes.ts`) resized to 48x48 PNG → `public/logos/<ICAO>.png` + `index.json`. Gitignored like the aircraft DB; trademarks of their owners, source license unclear. The app works without it (no logos, no 404s: only codes in `index.json` are requested). `src/core/airlineCode.ts` maps callsign → code; `src/data/logos.ts` holds the index + LOGOS toggle (`tracon3d.logos`).

## Rules

1. Per-frame work never goes through React state. UI refreshes at ~2 Hz from `TrafficSource.snapshot()`.
2. Small files, one job each, ~200 lines max.
3. Secrets: `.dev.vars` (worker: `TRAFFIC_SOURCE`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`) and `.env.local` (`VITE_MAPBOX_TOKEN`). Both gitignored; `.dev.vars.example` / `.env.example` committed. Everything must work with none set (anonymous OpenSky, Esri World Dark Gray tiles fallback).
4. Map: Mapbox raster tiles (`dark-v11`) when `VITE_MAPBOX_TOKEN` is set, else Esri World Dark Gray (CARTO's free tiles now require an API key). Show matching attribution.
5. Tests never hit the network.
6. `pnpm verify` (typecheck, lint, test, build) is the definition of done.
7. Theme: dark (default) / light, `data-theme` on <html> drives UI CSS variables (src/ui/ui.css); `FlightScene.setTheme` swaps scene colors and basemap in place (palettes in src/scene/theme.ts). Persisted as `tracon3d.theme`; light Mapbox style via `VITE_MAPBOX_STYLE_LIGHT` (default light-v11), Esri World Light Gray without a token.
