# Agent rules — TRACON 3D flight tracker

`design/` is the design handoff (reference only; never edit, never import from it). `design/README.md` is the authoritative spec for look and behavior; match colors/type/spacing exactly. `design/flight-scene.js` is the rendering approach to port (replace its simulator with live data). `design/support.js` is mockup runtime — ignore.

## Stack
pnpm · Vite · React 19 · TypeScript (strict) · three.js · Cloudflare Worker (via `@cloudflare/vite-plugin`, runs locally with no account) as the API proxy · Vitest.

## Layout
- `src/types.ts` — shared contracts (Airport, Aircraft, TrafficSource, FlightScene). Do not change shapes without updating all layers.
- `src/core/` — pure logic, no React/three/DOM: geo math, altitude color ramp, category/phase classification, dead reckoning, airport search ranking, airline lookup, type→class mapping. Unit tested.
- `src/data/` — browser data layer: airport index loading, OpenSky polling via `/api/*`, `TrafficSource` implementation, route/type enrichment.
- `src/scene/` — three.js only (no React). `createFlightScene(container): FlightScene`. Tuning values in `src/scene/constants.ts`.
- `src/ui/` — React panels (top bar, search, traffic list, details card, legend). 2D only.
- `src/App.tsx` — wires everything; owns app state (airport, selectedId, follow).
- `worker/` — Cloudflare Worker: `/api/states?lamin&lomin&lamax&lomax`, `/api/aircraft/:icao24`, `/api/route/:callsign`. Caches, backs off on 429, holds OpenSky OAuth client credentials server-side.
- `scripts/build-airports.ts` — downloads OurAirports CSVs → `public/data/airports.json`.

## Rules
1. Per-frame work never goes through React state. UI refreshes at ~2 Hz from `TrafficSource.snapshot()`.
2. Small files, one job each, ~200 lines max.
3. Secrets: `.dev.vars` (worker: `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`) and `.env.local` (`VITE_MAPBOX_TOKEN`). Both gitignored; `.dev.vars.example` / `.env.example` committed. Everything must work with none set (anonymous OpenSky, CARTO tiles fallback).
4. Map: Mapbox raster tiles (`dark-v11`) when `VITE_MAPBOX_TOKEN` is set, else CARTO `dark_nolabels`. Show matching attribution.
5. Tests never hit the network.
6. `pnpm verify` (typecheck, lint, test, build) is the definition of done.
