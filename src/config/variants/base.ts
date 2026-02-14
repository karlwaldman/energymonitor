// Base configuration shared across all variants
import type { PanelConfig, MapLayers } from "@/types";

// Shared exports (re-exported by all variants)
export { SECTORS, COMMODITIES, MARKET_SYMBOLS } from "../markets";
export { UNDERSEA_CABLES } from "../geo";

// API URLs - shared across all variants
export const API_URLS = {
  finnhub: (symbols: string[]) =>
    `/api/finnhub?symbols=${symbols.map((s) => encodeURIComponent(s)).join(",")}`,
  yahooFinance: (symbol: string) =>
    `/api/yahoo-finance?symbol=${encodeURIComponent(symbol)}`,
};

// Refresh intervals - shared across all variants
export const REFRESH_INTERVALS = {
  feeds: 5 * 60 * 1000,
  markets: 2 * 60 * 1000,
  ais: 10 * 60 * 1000,
};

// Monitor colors - shared
export const MONITOR_COLORS = [
  "#44ff88",
  "#ff8844",
  "#4488ff",
  "#ff44ff",
  "#ffff44",
  "#ff4444",
  "#44ffff",
  "#88ff44",
  "#ff88ff",
  "#88ffff",
];

// Storage keys - shared
export const STORAGE_KEYS = {
  panels: "energymonitor-panels",
  monitors: "energymonitor-monitors",
  mapLayers: "energymonitor-layers",
  disabledFeeds: "energymonitor-disabled-feeds",
} as const;

// Type definitions for variant configs
export interface VariantConfig {
  name: string;
  description: string;
  panels: Record<string, PanelConfig>;
  mapLayers: MapLayers;
  mobileMapLayers: MapLayers;
}
