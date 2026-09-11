// 041-protomaps-pmtiles-basemap: registers the `pmtiles://` MapLibre
// protocol exactly once (research.md R-2). Importing this module IS the
// registration — ES module singleton caching guarantees the side effect
// below runs exactly once regardless of how many files import it. The
// one real import site is panels/basemap/loadBasemapStyle.ts, the single
// shared module every map-rendering surface (FlowMapPanel.tsx,
// ZoneMapPanel.tsx, layout/settings/basemapTab.tsx's own preview map)
// already funnels basemap resolution through — so no other file, and no
// change to main.tsx's boot sequence, needs to know this exists.
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'

const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)

export {}
