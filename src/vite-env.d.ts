/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string
  /** Mapbox style: `mapbox://styles/user/id`, `user/id`, or a styles URL. Default mapbox/dark-v11. */
  readonly VITE_MAPBOX_STYLE?: string
  /** "mapbox" to use Mapbox Terrain-RGB for elevation; default is keyless AWS Terrarium. */
  readonly VITE_TERRAIN_SOURCE?: string
}
