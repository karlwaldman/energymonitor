// Energy intelligence variant - energymonitor.app
import type { PanelConfig, MapLayers } from "@/types";
import type { VariantConfig } from "./base";

// Re-export base config
export * from "./base";

// Energy-specific exports (infrastructure data)
export * from "../feeds";
export * from "../geo";
export * from "../pipelines";
export * from "../ports";

// Panel configuration for energy intelligence
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  map: { name: "Energy Map", enabled: true, priority: 1 },
  "opa-prices": { name: "Commodity Prices", enabled: true, priority: 1 },
  "live-news": { name: "Event Stream", enabled: true, priority: 1 },
  insights: { name: "AI Insights", enabled: true, priority: 1 },
  energy: { name: "Energy & Resources", enabled: true, priority: 1 },
  commodities: { name: "Commodities", enabled: false, priority: 3 },
  "eia-data": { name: "EIA Data", enabled: true, priority: 1 },
  "satellite-fires": { name: "Gas Flares & Fires", enabled: true, priority: 1 },
  middleeast: { name: "Middle East", enabled: true, priority: 1 },
  markets: { name: "Energy Stocks", enabled: true, priority: 2 },
  economic: { name: "Economic Indicators", enabled: true, priority: 2 },
  finance: { name: "Financial News", enabled: true, priority: 2 },
  "macro-signals": { name: "Market Radar", enabled: true, priority: 2 },
  monitors: { name: "My Monitors", enabled: true, priority: 2 },
};

// Map layers for energy view - pipelines, vessels, fires, and ports ON by default
export const DEFAULT_MAP_LAYERS: MapLayers = {
  conflicts: false,
  bases: false,
  cables: false,
  pipelines: true,
  hotspots: false,
  ais: true,
  nuclear: false,
  irradiators: false,
  sanctions: true,
  weather: true,
  economic: true,
  waterways: true,
  outages: true,
  datacenters: false,
  protests: false,
  flights: false,
  military: false,
  natural: true,
  spaceports: false,
  minerals: false,
  fires: true,
  tankers: true,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  wells: true,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
};

// Mobile defaults - fewer layers for performance
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = {
  conflicts: false,
  bases: false,
  cables: false,
  pipelines: true,
  hotspots: false,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  weather: true,
  economic: false,
  waterways: true,
  outages: true,
  datacenters: false,
  protests: false,
  flights: false,
  military: false,
  natural: true,
  spaceports: false,
  minerals: false,
  fires: true,
  tankers: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  wells: false,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
};

export const VARIANT_CONFIG: VariantConfig = {
  name: "energy",
  description:
    "Energy intelligence dashboard — commodity prices, infrastructure monitoring, and market analysis",
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
