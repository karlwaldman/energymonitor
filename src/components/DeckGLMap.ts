/**
 * DeckGLMap - WebGL-accelerated map visualization for desktop
 * Uses deck.gl for high-performance rendering of large datasets
 * Mobile devices gracefully degrade to the D3/SVG-based Map component
 */
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, LayersList, PickingInfo } from "@deck.gl/core";
import {
  GeoJsonLayer,
  ScatterplotLayer,
  PathLayer,
  IconLayer,
  TextLayer,
} from "@deck.gl/layers";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import type {
  MapLayers,
  Hotspot,
  NewsItem,
  Earthquake,
  InternetOutage,
  RelatedAsset,
  AssetType,
  AisDisruptionEvent,
  AisDensityZone,
  SocialUnrestEvent,
  MilitaryFlight,
  MilitaryVessel,
  MilitaryFlightCluster,
  MilitaryVesselCluster,
  NaturalEvent,
  MapProtestCluster,
} from "@/types";
import type { WeatherAlert } from "@/services/weather";
import { escapeHtml } from "@/utils/sanitize";
import { debounce, rafSchedule } from "@/utils/index";
import {
  INTEL_HOTSPOTS,
  CONFLICT_ZONES,
  MILITARY_BASES,
  NUCLEAR_FACILITIES,
  PIPELINES,
  PIPELINE_COLORS,
  STRATEGIC_WATERWAYS,
  ECONOMIC_CENTERS,
  PORTS,
  CRITICAL_MINERALS,
} from "@/config";
import { MapPopup, type PopupType } from "./MapPopup";
import {
  updateHotspotEscalation,
  getHotspotEscalation,
  setMilitaryData,
  setCIIGetter,
  setGeoAlertGetter,
} from "@/services/hotspot-escalation";
import { getCountryScore } from "@/services/country-instability";
import { getAlertsNearLocation } from "@/services/geo-convergence";

export type TimeRange = "1h" | "6h" | "24h" | "48h" | "7d" | "all";
export type DeckMapView =
  | "global"
  | "america"
  | "mena"
  | "eu"
  | "asia"
  | "latam"
  | "africa"
  | "oceania";
type MapInteractionMode = "flat" | "3d";

interface DeckMapState {
  zoom: number;
  pan: { x: number; y: number };
  view: DeckMapView;
  layers: MapLayers;
  timeRange: TimeRange;
}

interface HotspotWithBreaking extends Hotspot {
  hasBreaking?: boolean;
}

// View presets with longitude, latitude, zoom
const VIEW_PRESETS: Record<
  DeckMapView,
  { longitude: number; latitude: number; zoom: number }
> = {
  global: { longitude: 0, latitude: 20, zoom: 1.5 },
  america: { longitude: -95, latitude: 38, zoom: 3 },
  mena: { longitude: 45, latitude: 28, zoom: 3.5 },
  eu: { longitude: 15, latitude: 50, zoom: 3.5 },
  asia: { longitude: 105, latitude: 35, zoom: 3 },
  latam: { longitude: -60, latitude: -15, zoom: 3 },
  africa: { longitude: 20, latitude: 5, zoom: 3 },
  oceania: { longitude: 135, latitude: -25, zoom: 3.5 },
};

const MAP_INTERACTION_MODE: MapInteractionMode =
  import.meta.env.VITE_MAP_INTERACTION_MODE === "flat" ? "flat" : "3d";

// Zoom thresholds for layer visibility and labels (matches old Map.ts)
// Zoom-dependent layer visibility and labels
const LAYER_ZOOM_THRESHOLDS: Partial<
  Record<keyof MapLayers, { minZoom: number; showLabels?: number }>
> = {
  bases: { minZoom: 3, showLabels: 5 },
  nuclear: { minZoom: 3 },
  conflicts: { minZoom: 1, showLabels: 3 },
  economic: { minZoom: 3 },
  natural: { minZoom: 1, showLabels: 2 },
};
// Export for external use
export { LAYER_ZOOM_THRESHOLDS };

// Color constants matching the dark theme
const COLORS = {
  hotspotHigh: [255, 68, 68, 200] as [number, number, number, number],
  hotspotElevated: [255, 165, 0, 200] as [number, number, number, number],
  hotspotLow: [255, 255, 0, 180] as [number, number, number, number],
  conflict: [255, 0, 0, 100] as [number, number, number, number],
  base: [0, 150, 255, 200] as [number, number, number, number],
  nuclear: [255, 215, 0, 200] as [number, number, number, number],
  earthquake: [255, 100, 50, 200] as [number, number, number, number],
  vesselMilitary: [255, 100, 100, 220] as [number, number, number, number],
  flightMilitary: [255, 50, 50, 220] as [number, number, number, number],
  protest: [255, 150, 0, 200] as [number, number, number, number],
  outage: [255, 50, 50, 180] as [number, number, number, number],
  weather: [100, 150, 255, 180] as [number, number, number, number],
};

// SVG icons as data URLs for different marker shapes
const MARKER_ICONS = {
  // Diamond - for hotspots
  diamond:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 30,16 16,30 2,16" fill="white"/></svg>`,
    ),
  // Triangle up - for military bases
  triangleUp:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 30,28 2,28" fill="white"/></svg>`,
    ),
  // Hexagon - for nuclear
  hexagon:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="white"/></svg>`,
    ),
  // Circle - fallback
  circle:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="white"/></svg>`,
    ),
  // Star - for special markers
  star:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 20,12 30,12 22,19 25,30 16,23 7,30 10,19 2,12 12,12" fill="white"/></svg>`,
    ),
};

export class DeckGLMap {
  private container: HTMLElement;
  private deckOverlay: MapboxOverlay | null = null;
  private maplibreMap: maplibregl.Map | null = null;
  private state: DeckMapState;
  private popup: MapPopup;

  // Data stores
  private hotspots: HotspotWithBreaking[];
  private earthquakes: Earthquake[] = [];
  private weatherAlerts: WeatherAlert[] = [];
  private outages: InternetOutage[] = [];
  private aisDisruptions: AisDisruptionEvent[] = [];
  private aisDensity: AisDensityZone[] = [];
  private protests: SocialUnrestEvent[] = [];
  private militaryFlights: MilitaryFlight[] = [];
  private militaryFlightClusters: MilitaryFlightCluster[] = [];
  private militaryVessels: MilitaryVessel[] = [];
  private militaryVesselClusters: MilitaryVesselCluster[] = [];
  private naturalEvents: NaturalEvent[] = [];
  private firmsFireData: Array<{
    lat: number;
    lon: number;
    brightness: number;
    frp: number;
    confidence: number;
    region: string;
    acq_date: string;
    daynight: string;
  }> = [];
  private news: NewsItem[] = [];

  // Country highlight state
  private countryGeoJsonLoaded = false;

  // Callbacks
  private onHotspotClick?: (hotspot: Hotspot) => void;
  private onTimeRangeChange?: (range: TimeRange) => void;
  private onCountryClick?: (lat: number, lon: number) => void;
  private onLayerChange?: (layer: keyof MapLayers, enabled: boolean) => void;
  private onStateChange?: (state: DeckMapState) => void;

  // Highlighted assets
  private highlightedAssets: Record<AssetType, Set<string>> = {
    pipeline: new Set(),
    cable: new Set(),
    datacenter: new Set(),
    base: new Set(),
    nuclear: new Set(),
  };

  private timestampIntervalId: ReturnType<typeof setInterval> | null = null;
  private renderScheduled = false;
  private renderPaused = false;
  private renderPending = false;
  private resizeObserver: ResizeObserver | null = null;

  private layerCache: Map<string, Layer> = new Map();
  private lastZoomThreshold = 0;
  private protestSC: Supercluster | null = null;
  private protestClusters: MapProtestCluster[] = [];
  private lastSCZoom = -1;
  private newsPulseIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastPipelineHighlightSignature = "";
  private debouncedRebuildLayers: () => void;
  private rafUpdateLayers: () => void;
  private moveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement, initialState: DeckMapState) {
    this.container = container;
    this.state = initialState;
    this.hotspots = [...INTEL_HOTSPOTS];

    this.debouncedRebuildLayers = debounce(() => {
      this.maplibreMap?.resize();
      this.deckOverlay?.setProps({ layers: this.buildLayers() });
    }, 150);
    this.rafUpdateLayers = rafSchedule(() => {
      this.deckOverlay?.setProps({ layers: this.buildLayers() });
    });

    this.setupDOM();
    this.popup = new MapPopup(container);

    this.initMapLibre();

    this.maplibreMap?.on("load", () => {
      this.initDeck();
      this.loadCountryBoundaries();
      this.render();
    });

    this.setupResizeObserver();

    this.createControls();
    this.createTimeSlider();
    this.createLayerToggles();
    this.createLegend();
    this.createTimestamp();
  }

  private setupDOM(): void {
    const wrapper = document.createElement("div");
    wrapper.className = "deckgl-map-wrapper";
    wrapper.id = "deckglMapWrapper";
    wrapper.style.cssText =
      "position: relative; width: 100%; height: 100%; overflow: hidden;";

    // MapLibre container - deck.gl renders directly into MapLibre via MapboxOverlay
    const mapContainer = document.createElement("div");
    mapContainer.id = "deckgl-basemap";
    mapContainer.style.cssText =
      "position: absolute; top: 0; left: 0; width: 100%; height: 100%;";
    wrapper.appendChild(mapContainer);

    this.container.appendChild(wrapper);
  }

  private initMapLibre(): void {
    const preset = VIEW_PRESETS[this.state.view];

    this.maplibreMap = new maplibregl.Map({
      container: "deckgl-basemap",
      style: {
        version: 8,
        name: "Dark",
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: {
              "background-color": "#0a0f0c",
            },
          },
          {
            id: "carto-dark-layer",
            type: "raster",
            source: "carto-dark",
            minzoom: 0,
            maxzoom: 22,
          },
        ],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      center: [preset.longitude, preset.latitude],
      zoom: preset.zoom,
      attributionControl: false,
      interactive: true,
      ...(MAP_INTERACTION_MODE === "flat"
        ? {
            maxPitch: 0,
            pitchWithRotate: false,
            dragRotate: false,
            touchPitch: false,
          }
        : {}),
    });
  }

  private initDeck(): void {
    if (!this.maplibreMap) return;

    this.deckOverlay = new MapboxOverlay({
      interleaved: false,
      layers: this.buildLayers(),
      getTooltip: (info: PickingInfo) => this.getTooltip(info),
      onClick: (info: PickingInfo) => this.handleClick(info),
      pickingRadius: 10,
      useDevicePixels: window.devicePixelRatio > 2 ? 2 : true,
    });

    this.maplibreMap.addControl(
      this.deckOverlay as unknown as maplibregl.IControl,
    );

    this.maplibreMap.on("movestart", () => {
      if (this.moveTimeoutId) {
        clearTimeout(this.moveTimeoutId);
        this.moveTimeoutId = null;
      }
    });

    this.maplibreMap.on("moveend", () => {
      this.lastSCZoom = -1;
      this.rafUpdateLayers();
    });

    this.maplibreMap.on("move", () => {
      if (this.moveTimeoutId) clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = setTimeout(() => {
        this.lastSCZoom = -1;
        this.rafUpdateLayers();
      }, 100);
    });

    this.maplibreMap.on("zoom", () => {
      if (this.moveTimeoutId) clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = setTimeout(() => {
        this.lastSCZoom = -1;
        this.rafUpdateLayers();
      }, 100);
    });

    this.maplibreMap.on("zoomend", () => {
      const currentZoom = Math.floor(this.maplibreMap?.getZoom() || 2);
      const thresholdCrossed =
        Math.abs(currentZoom - this.lastZoomThreshold) >= 1;
      if (thresholdCrossed) {
        this.lastZoomThreshold = currentZoom;
        this.debouncedRebuildLayers();
      }
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.maplibreMap) {
        this.maplibreMap.resize();
      }
    });
    this.resizeObserver.observe(this.container);
  }

  private getSetSignature(set: Set<string>): string {
    return [...set].sort().join("|");
  }

  private rebuildProtestSupercluster(): void {
    const points = this.protests.map((p, i) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.lon, p.lat] as [number, number],
      },
      properties: { index: i },
    }));
    this.protestSC = new Supercluster({ radius: 60, maxZoom: 14 });
    this.protestSC.load(points);
    this.lastSCZoom = -1;
  }

  private updateClusterData(): void {
    const zoom = Math.floor(this.maplibreMap?.getZoom() ?? 2);
    if (zoom === this.lastSCZoom) return;
    this.lastSCZoom = zoom;

    const bounds = this.maplibreMap?.getBounds();
    if (!bounds) return;
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];

    if (this.protestSC) {
      this.protestClusters = this.protestSC.getClusters(bbox, zoom).map((f) => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const leaves = this.protestSC!.getLeaves(
            f.properties.cluster_id!,
            Infinity,
          );
          const items = leaves
            .map((l) => this.protests[l.properties.index])
            .filter((x): x is SocialUnrestEvent => !!x);
          const maxSev = items.some((i) => i.severity === "high")
            ? "high"
            : items.some((i) => i.severity === "medium")
              ? "medium"
              : "low";
          return {
            id: `pc-${f.properties.cluster_id}`,
            lat: coords[1],
            lon: coords[0],
            count: f.properties.point_count!,
            items,
            country: items[0]?.country ?? "",
            maxSeverity: maxSev as "low" | "medium" | "high",
            hasRiot: items.some((i) => i.eventType === "riot"),
            totalFatalities: items.reduce((s, i) => s + (i.fatalities ?? 0), 0),
          };
        }
        const item = this.protests[f.properties.index]!;
        return {
          id: `pp-${f.properties.index}`,
          lat: item.lat,
          lon: item.lon,
          count: 1,
          items: [item],
          country: item.country,
          maxSeverity: item.severity,
          hasRiot: item.eventType === "riot",
          totalFatalities: item.fatalities ?? 0,
        };
      });
    }
  }

  private isLayerVisible(layerKey: keyof MapLayers): boolean {
    const threshold = LAYER_ZOOM_THRESHOLDS[layerKey];
    if (!threshold) return true;
    const zoom = this.maplibreMap?.getZoom() || 2;
    return zoom >= threshold.minZoom;
  }

  private buildLayers(): LayersList {
    const startTime = performance.now();
    const layers: (Layer | null | false)[] = [];
    const { layers: mapLayers } = this.state;

    // Pipelines layer
    if (mapLayers.pipelines) {
      layers.push(this.createPipelinesLayer());
    }

    // Conflict zones layer
    if (mapLayers.conflicts) {
      layers.push(this.createConflictZonesLayer());
    }

    // Military bases layer — hidden at low zoom (E: progressive disclosure) + ghost
    if (mapLayers.bases && this.isLayerVisible("bases")) {
      layers.push(this.createBasesLayer());
      layers.push(
        this.createGhostLayer(
          "bases-layer",
          MILITARY_BASES,
          (d) => [d.lon, d.lat],
          { radiusMinPixels: 12 },
        ),
      );
    }

    // Nuclear facilities layer — hidden at low zoom + ghost
    if (mapLayers.nuclear && this.isLayerVisible("nuclear")) {
      layers.push(this.createNuclearLayer());
      layers.push(
        this.createGhostLayer(
          "nuclear-layer",
          NUCLEAR_FACILITIES.filter((f) => f.status !== "decommissioned"),
          (d) => [d.lon, d.lat],
          { radiusMinPixels: 12 },
        ),
      );
    }

    // Hotspots layer (all hotspots including high/breaking, with pulse + ghost)
    if (mapLayers.hotspots) {
      layers.push(...this.createHotspotsLayers());
    }

    // Earthquakes layer + ghost for easier picking
    if (mapLayers.natural && this.earthquakes.length > 0) {
      layers.push(this.createEarthquakesLayer());
      layers.push(
        this.createGhostLayer(
          "earthquakes-layer",
          this.earthquakes,
          (d) => [d.lon, d.lat],
          { radiusMinPixels: 12 },
        ),
      );
    }

    // Natural events layer
    if (mapLayers.natural && this.naturalEvents.length > 0) {
      layers.push(this.createNaturalEventsLayer());
    }

    // Satellite fires layer (NASA FIRMS)
    if (mapLayers.fires && this.firmsFireData.length > 0) {
      layers.push(this.createFiresLayer());
    }

    // Weather alerts layer
    if (mapLayers.weather && this.weatherAlerts.length > 0) {
      layers.push(this.createWeatherLayer());
    }

    // Internet outages layer + ghost for easier picking
    if (mapLayers.outages && this.outages.length > 0) {
      layers.push(this.createOutagesLayer());
      layers.push(
        this.createGhostLayer(
          "outages-layer",
          this.outages,
          (d) => [d.lon, d.lat],
          { radiusMinPixels: 12 },
        ),
      );
    }

    // AIS density layer
    if (mapLayers.ais && this.aisDensity.length > 0) {
      layers.push(this.createAisDensityLayer());
    }

    // AIS disruptions layer (spoofing/jamming)
    if (mapLayers.ais && this.aisDisruptions.length > 0) {
      layers.push(this.createAisDisruptionsLayer());
    }

    // Strategic ports layer (shown with AIS)
    if (mapLayers.ais) {
      layers.push(this.createPortsLayer());
    }

    // Protests layer (Supercluster-based deck.gl layers)
    if (mapLayers.protests && this.protests.length > 0) {
      layers.push(...this.createProtestClusterLayers());
    }

    // Military vessels layer
    if (mapLayers.military && this.militaryVessels.length > 0) {
      layers.push(this.createMilitaryVesselsLayer());
    }

    // Military vessel clusters layer
    if (mapLayers.military && this.militaryVesselClusters.length > 0) {
      layers.push(this.createMilitaryVesselClustersLayer());
    }

    // Military flights layer
    if (mapLayers.military && this.militaryFlights.length > 0) {
      layers.push(this.createMilitaryFlightsLayer());
    }

    // Military flight clusters layer
    if (mapLayers.military && this.militaryFlightClusters.length > 0) {
      layers.push(this.createMilitaryFlightClustersLayer());
    }

    // Strategic waterways layer
    if (mapLayers.waterways) {
      layers.push(this.createWaterwaysLayer());
    }

    // Economic centers layer — hidden at low zoom
    if (mapLayers.economic && this.isLayerVisible("economic")) {
      layers.push(this.createEconomicCentersLayer());
    }

    // Critical minerals layer
    if (mapLayers.minerals) {
      layers.push(this.createMineralsLayer());
    }

    const result = layers.filter(Boolean) as LayersList;
    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(
        `[DeckGLMap] buildLayers took ${elapsed.toFixed(2)}ms (>16ms budget), ${result.length} layers`,
      );
    }
    return result;
  }

  // Layer creation methods
  private createPipelinesLayer(): PathLayer {
    const highlightedPipelines = this.highlightedAssets.pipeline;
    const cacheKey = "pipelines-layer";
    const cached = this.layerCache.get(cacheKey) as PathLayer | undefined;
    const highlightSignature = this.getSetSignature(highlightedPipelines);
    if (cached && highlightSignature === this.lastPipelineHighlightSignature)
      return cached;

    const layer = new PathLayer({
      id: cacheKey,
      data: PIPELINES,
      getPath: (d) => d.points,
      getColor: (d) => {
        if (highlightedPipelines.has(d.id)) {
          return [255, 100, 100, 200] as [number, number, number, number];
        }
        const colorKey = d.type as keyof typeof PIPELINE_COLORS;
        const hex = PIPELINE_COLORS[colorKey] || "#666666";
        return this.hexToRgba(hex, 150);
      },
      getWidth: (d) => (highlightedPipelines.has(d.id) ? 3 : 1.5),
      widthMinPixels: 1,
      widthMaxPixels: 4,
      pickable: true,
      updateTriggers: { highlighted: highlightSignature },
    });

    this.lastPipelineHighlightSignature = highlightSignature;
    this.layerCache.set(cacheKey, layer);
    return layer;
  }

  private createConflictZonesLayer(): GeoJsonLayer {
    const cacheKey = "conflict-zones-layer";

    const geojsonData = {
      type: "FeatureCollection" as const,
      features: CONFLICT_ZONES.map((zone) => ({
        type: "Feature" as const,
        properties: { id: zone.id, name: zone.name, intensity: zone.intensity },
        geometry: {
          type: "Polygon" as const,
          coordinates: [zone.coords],
        },
      })),
    };

    const layer = new GeoJsonLayer({
      id: cacheKey,
      data: geojsonData,
      filled: true,
      stroked: true,
      getFillColor: () => COLORS.conflict,
      getLineColor: () => [255, 0, 0, 180] as [number, number, number, number],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pickable: true,
    });
    return layer;
  }

  private createBasesLayer(): IconLayer {
    const highlightedBases = this.highlightedAssets.base;

    // Base colors by operator type - semi-transparent for layering
    // F: Fade in bases as you zoom — subtle at zoom 3, full at zoom 5+
    const zoom = this.maplibreMap?.getZoom() || 3;
    const alphaScale = Math.min(1, (zoom - 2.5) / 2.5); // 0.2 at zoom 3, 1.0 at zoom 5
    const a = Math.round(160 * Math.max(0.3, alphaScale));

    const getBaseColor = (type: string): [number, number, number, number] => {
      switch (type) {
        case "us-nato":
          return [68, 136, 255, a];
        case "russia":
          return [255, 68, 68, a];
        case "china":
          return [255, 136, 68, a];
        case "uk":
          return [68, 170, 255, a];
        case "france":
          return [0, 85, 164, a];
        case "india":
          return [255, 153, 51, a];
        case "japan":
          return [188, 0, 45, a];
        default:
          return [136, 136, 136, a];
      }
    };

    // Military bases: TRIANGLE icons - color by operator, semi-transparent
    return new IconLayer({
      id: "bases-layer",
      data: MILITARY_BASES,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => "triangleUp",
      iconAtlas: MARKER_ICONS.triangleUp,
      iconMapping: {
        triangleUp: { x: 0, y: 0, width: 32, height: 32, mask: true },
      },
      getSize: (d) => (highlightedBases.has(d.id) ? 16 : 11),
      getColor: (d) => {
        if (highlightedBases.has(d.id)) {
          return [255, 100, 100, 220] as [number, number, number, number];
        }
        return getBaseColor(d.type);
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 16,
      pickable: true,
    });
  }

  private createNuclearLayer(): IconLayer {
    const highlightedNuclear = this.highlightedAssets.nuclear;
    const data = NUCLEAR_FACILITIES.filter(
      (f) => f.status !== "decommissioned",
    );

    // Nuclear: HEXAGON icons - yellow/orange color, semi-transparent
    return new IconLayer({
      id: "nuclear-layer",
      data,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => "hexagon",
      iconAtlas: MARKER_ICONS.hexagon,
      iconMapping: {
        hexagon: { x: 0, y: 0, width: 32, height: 32, mask: true },
      },
      getSize: (d) => (highlightedNuclear.has(d.id) ? 15 : 11),
      getColor: (d) => {
        if (highlightedNuclear.has(d.id)) {
          return [255, 100, 100, 220] as [number, number, number, number];
        }
        if (d.status === "contested") {
          return [255, 50, 50, 200] as [number, number, number, number];
        }
        return [255, 220, 0, 200] as [number, number, number, number]; // Semi-transparent yellow
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 15,
      pickable: true,
    });
  }

  private createPortsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "ports-layer",
      data: PORTS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 6000,
      getFillColor: (d) => {
        // Color by port type (matching old Map.ts icons)
        switch (d.type) {
          case "naval":
            return [100, 150, 255, 200] as [number, number, number, number]; // Blue - ⚓
          case "oil":
            return [255, 140, 0, 200] as [number, number, number, number]; // Orange - 🛢️
          case "lng":
            return [255, 200, 50, 200] as [number, number, number, number]; // Yellow - 🛢️
          case "container":
            return [0, 200, 255, 180] as [number, number, number, number]; // Cyan - 🏭
          case "mixed":
            return [150, 200, 150, 180] as [number, number, number, number]; // Green
          case "bulk":
            return [180, 150, 120, 180] as [number, number, number, number]; // Brown
          default:
            return [0, 200, 255, 160] as [number, number, number, number];
        }
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createGhostLayer<T>(
    id: string,
    data: T[],
    getPosition: (d: T) => [number, number],
    opts: { radiusMinPixels?: number } = {},
  ): ScatterplotLayer<T> {
    return new ScatterplotLayer<T>({
      id: `${id}-ghost`,
      data,
      getPosition,
      getRadius: 1,
      radiusMinPixels: opts.radiusMinPixels ?? 12,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
    });
  }

  private createEarthquakesLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "earthquakes-layer",
      data: this.earthquakes,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => Math.pow(2, d.magnitude) * 1000,
      getFillColor: (d) => {
        const mag = d.magnitude;
        if (mag >= 6)
          return [255, 0, 0, 200] as [number, number, number, number];
        if (mag >= 5)
          return [255, 100, 0, 200] as [number, number, number, number];
        return COLORS.earthquake;
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 30,
      pickable: true,
    });
  }

  private createNaturalEventsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "natural-events-layer",
      data: this.naturalEvents,
      getPosition: (d: NaturalEvent) => [d.lon, d.lat],
      getRadius: (d: NaturalEvent) =>
        d.title.startsWith("🔴")
          ? 20000
          : d.title.startsWith("🟠")
            ? 15000
            : 8000,
      getFillColor: (d: NaturalEvent) => {
        if (d.title.startsWith("🔴"))
          return [255, 0, 0, 220] as [number, number, number, number];
        if (d.title.startsWith("🟠"))
          return [255, 140, 0, 200] as [number, number, number, number];
        return [255, 150, 50, 180] as [number, number, number, number];
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      pickable: true,
    });
  }

  private createFiresLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "fires-layer",
      data: this.firmsFireData,
      getPosition: (d: (typeof this.firmsFireData)[0]) => [d.lon, d.lat],
      getRadius: (d: (typeof this.firmsFireData)[0]) =>
        Math.min(d.frp * 200, 30000) || 5000,
      getFillColor: (d: (typeof this.firmsFireData)[0]) => {
        if (d.brightness > 400)
          return [255, 30, 0, 220] as [number, number, number, number];
        if (d.brightness > 350)
          return [255, 140, 0, 200] as [number, number, number, number];
        return [255, 220, 50, 180] as [number, number, number, number];
      },
      radiusMinPixels: 3,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createWeatherLayer(): ScatterplotLayer {
    // Filter weather alerts that have centroid coordinates
    const alertsWithCoords = this.weatherAlerts.filter(
      (a) => a.centroid && a.centroid.length === 2,
    );

    return new ScatterplotLayer({
      id: "weather-layer",
      data: alertsWithCoords,
      getPosition: (d) => d.centroid as [number, number], // centroid is [lon, lat]
      getRadius: 25000,
      getFillColor: (d) => {
        if (d.severity === "Extreme")
          return [255, 0, 0, 200] as [number, number, number, number];
        if (d.severity === "Severe")
          return [255, 100, 0, 180] as [number, number, number, number];
        if (d.severity === "Moderate")
          return [255, 170, 0, 160] as [number, number, number, number];
        return COLORS.weather;
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 20,
      pickable: true,
    });
  }

  private createOutagesLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "outages-layer",
      data: this.outages,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 20000,
      getFillColor: COLORS.outage,
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      pickable: true,
    });
  }

  private createAisDensityLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "ais-density-layer",
      data: this.aisDensity,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 4000 + d.intensity * 8000,
      getFillColor: (d) => {
        const intensity = Math.min(Math.max(d.intensity, 0.15), 1);
        const isCongested = (d.deltaPct || 0) >= 15;
        const alpha = Math.round(40 + intensity * 160);
        // Orange for congested areas, cyan for normal traffic
        if (isCongested) {
          return [255, 183, 3, alpha] as [number, number, number, number]; // #ffb703
        }
        return [0, 209, 255, alpha] as [number, number, number, number]; // #00d1ff
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createAisDisruptionsLayer(): ScatterplotLayer {
    // AIS spoofing/jamming events
    return new ScatterplotLayer({
      id: "ais-disruptions-layer",
      data: this.aisDisruptions,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: (d) => {
        // Color by severity/type
        if (d.severity === "high" || d.type === "spoofing") {
          return [255, 50, 50, 220] as [number, number, number, number]; // Red
        }
        if (d.severity === "medium") {
          return [255, 150, 0, 200] as [number, number, number, number]; // Orange
        }
        return [255, 200, 100, 180] as [number, number, number, number]; // Yellow
      },
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 150] as [number, number, number, number],
      lineWidthMinPixels: 1,
    });
  }

  private createMilitaryVesselsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "military-vessels-layer",
      data: this.militaryVessels,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 6000,
      getFillColor: COLORS.vesselMilitary,
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createMilitaryVesselClustersLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "military-vessel-clusters-layer",
      data: this.militaryVesselClusters,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 15000 + (d.vesselCount || 1) * 3000,
      getFillColor: (d) => {
        // Vessel types: 'exercise' | 'deployment' | 'transit' | 'unknown'
        const activity = d.activityType || "unknown";
        if (activity === "exercise" || activity === "deployment")
          return [255, 100, 100, 200] as [number, number, number, number];
        if (activity === "transit")
          return [255, 180, 100, 180] as [number, number, number, number];
        return [200, 150, 150, 160] as [number, number, number, number];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      pickable: true,
    });
  }

  private createMilitaryFlightsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "military-flights-layer",
      data: this.militaryFlights,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: COLORS.flightMilitary,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createMilitaryFlightClustersLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "military-flight-clusters-layer",
      data: this.militaryFlightClusters,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 15000 + (d.flightCount || 1) * 3000,
      getFillColor: (d) => {
        const activity = d.activityType || "unknown";
        if (activity === "exercise" || activity === "patrol")
          return [100, 150, 255, 200] as [number, number, number, number];
        if (activity === "transport")
          return [255, 200, 100, 180] as [number, number, number, number];
        return [150, 150, 200, 160] as [number, number, number, number];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      pickable: true,
    });
  }

  private createWaterwaysLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "waterways-layer",
      data: STRATEGIC_WATERWAYS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 10000,
      getFillColor: [100, 150, 255, 180] as [number, number, number, number],
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createEconomicCentersLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: "economic-centers-layer",
      data: ECONOMIC_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: [255, 215, 0, 180] as [number, number, number, number],
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createMineralsLayer(): ScatterplotLayer {
    // Critical minerals projects
    return new ScatterplotLayer({
      id: "minerals-layer",
      data: CRITICAL_MINERALS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: (d) => {
        // Color by mineral type
        switch (d.mineral) {
          case "Lithium":
            return [0, 200, 255, 200] as [number, number, number, number]; // Cyan
          case "Cobalt":
            return [100, 100, 255, 200] as [number, number, number, number]; // Blue
          case "Rare Earths":
            return [255, 100, 200, 200] as [number, number, number, number]; // Pink
          case "Nickel":
            return [100, 255, 100, 200] as [number, number, number, number]; // Green
          default:
            return [200, 200, 200, 200] as [number, number, number, number]; // Gray
        }
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createProtestClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(
      new ScatterplotLayer<MapProtestCluster>({
        id: "protest-clusters-layer",
        data: this.protestClusters,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 15000 + d.count * 2000,
        radiusMinPixels: 6,
        radiusMaxPixels: 22,
        getFillColor: (d) => {
          if (d.hasRiot)
            return [220, 40, 40, 200] as [number, number, number, number];
          if (d.maxSeverity === "high")
            return [255, 80, 60, 180] as [number, number, number, number];
          if (d.maxSeverity === "medium")
            return [255, 160, 40, 160] as [number, number, number, number];
          return [255, 220, 80, 140] as [number, number, number, number];
        },
        pickable: true,
        updateTriggers: {
          getRadius: this.lastSCZoom,
          getFillColor: this.lastSCZoom,
        },
      }),
    );

    layers.push(
      this.createGhostLayer(
        "protest-clusters-layer",
        this.protestClusters,
        (d) => [d.lon, d.lat],
        { radiusMinPixels: 14 },
      ),
    );

    const multiClusters = this.protestClusters.filter((c) => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(
        new TextLayer<MapProtestCluster>({
          id: "protest-clusters-badge",
          data: multiClusters,
          getText: (d) => String(d.count),
          getPosition: (d) => [d.lon, d.lat],
          background: true,
          getBackgroundColor: [0, 0, 0, 180],
          backgroundPadding: [4, 2, 4, 2],
          getColor: [255, 255, 255, 255],
          getSize: 12,
          getPixelOffset: [0, -14],
          pickable: false,
          fontFamily: "system-ui, sans-serif",
          fontWeight: 700,
        }),
      );
    }

    const pulseClusters = this.protestClusters.filter(
      (c) => c.maxSeverity === "high" || c.hasRiot,
    );
    if (pulseClusters.length > 0) {
      const pulse =
        1.0 +
        0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(
        new ScatterplotLayer<MapProtestCluster>({
          id: "protest-clusters-pulse",
          data: pulseClusters,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: (d) => 15000 + d.count * 2000,
          radiusScale: pulse,
          radiusMinPixels: 8,
          radiusMaxPixels: 30,
          stroked: true,
          filled: false,
          getLineColor: (d) =>
            d.hasRiot
              ? ([220, 40, 40, 120] as [number, number, number, number])
              : ([255, 80, 60, 100] as [number, number, number, number]),
          lineWidthMinPixels: 1.5,
          pickable: false,
          updateTriggers: { radiusScale: this.pulseTime },
        }),
      );
    }

    return layers;
  }

  private createHotspotsLayers(): Layer[] {
    const zoom = this.maplibreMap?.getZoom() || 2;
    const zoomScale = Math.min(1, (zoom - 1) / 3);
    const maxPx = 6 + Math.round(14 * zoomScale);
    const baseOpacity = zoom < 2.5 ? 0.5 : zoom < 4 ? 0.7 : 1.0;
    const layers: Layer[] = [];

    layers.push(
      new ScatterplotLayer({
        id: "hotspots-layer",
        data: this.hotspots,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => {
          const score = d.escalationScore || 1;
          return 10000 + score * 5000;
        },
        getFillColor: (d) => {
          const score = d.escalationScore || 1;
          const a = Math.round(
            (score >= 4 ? 200 : score >= 2 ? 200 : 180) * baseOpacity,
          );
          if (score >= 4)
            return [255, 68, 68, a] as [number, number, number, number];
          if (score >= 2)
            return [255, 165, 0, a] as [number, number, number, number];
          return [255, 255, 0, a] as [number, number, number, number];
        },
        radiusMinPixels: 4,
        radiusMaxPixels: maxPx,
        pickable: true,
        stroked: true,
        getLineColor: (d) =>
          d.hasBreaking
            ? ([255, 255, 255, 255] as [number, number, number, number])
            : ([0, 0, 0, 0] as [number, number, number, number]),
        lineWidthMinPixels: 2,
      }),
    );

    layers.push(
      this.createGhostLayer(
        "hotspots-layer",
        this.hotspots,
        (d) => [d.lon, d.lat],
        { radiusMinPixels: 14 },
      ),
    );

    const highHotspots = this.hotspots.filter(
      (h) => h.level === "high" || h.hasBreaking,
    );
    if (highHotspots.length > 0) {
      const pulse =
        1.0 +
        0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(
        new ScatterplotLayer({
          id: "hotspots-pulse",
          data: highHotspots,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: (d) => {
            const score = d.escalationScore || 1;
            return 10000 + score * 5000;
          },
          radiusScale: pulse,
          radiusMinPixels: 6,
          radiusMaxPixels: 30,
          stroked: true,
          filled: false,
          getLineColor: (d) => {
            const a = Math.round(120 * baseOpacity);
            return d.hasBreaking
              ? ([255, 50, 50, a] as [number, number, number, number])
              : ([255, 165, 0, a] as [number, number, number, number]);
          },
          lineWidthMinPixels: 1.5,
          pickable: false,
          updateTriggers: { radiusScale: this.pulseTime },
        }),
      );
    }

    return layers;
  }

  private pulseTime = 0;

  private needsPulseAnimation(): boolean {
    return (
      this.protestClusters.some((c) => c.maxSeverity === "high" || c.hasRiot) ||
      this.hotspots.some((h) => h.level === "high" || h.hasBreaking)
    );
  }

  private startPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) return;
    const PULSE_UPDATE_INTERVAL_MS = 250;

    this.newsPulseIntervalId = setInterval(() => {
      const now = Date.now();
      if (!this.needsPulseAnimation()) {
        this.pulseTime = now;
        this.stopPulseAnimation();
        this.rafUpdateLayers();
        return;
      }
      this.pulseTime = now;
      this.rafUpdateLayers();
    }, PULSE_UPDATE_INTERVAL_MS);
  }

  private stopPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) {
      clearInterval(this.newsPulseIntervalId);
      this.newsPulseIntervalId = null;
    }
  }

  private getTooltip(info: PickingInfo): { html: string } | null {
    if (!info.object) return null;

    const rawLayerId = info.layer?.id || "";
    const layerId = rawLayerId.endsWith("-ghost")
      ? rawLayerId.slice(0, -6)
      : rawLayerId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = info.object as any;
    const text = (value: unknown): string => escapeHtml(String(value ?? ""));

    switch (layerId) {
      case "hotspots-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.subtext)}</div>`,
        };
      case "earthquakes-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>M${(obj.magnitude || 0).toFixed(1)} Earthquake</strong><br/>${text(obj.place)}</div>`,
        };
      case "military-vessels-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.operatorCountry)}</div>`,
        };
      case "military-flights-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.callsign || obj.registration || "Military Aircraft")}</strong><br/>${text(obj.type)}</div>`,
        };
      case "military-vessel-clusters-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name || "Vessel Cluster")}</strong><br/>${obj.vesselCount || 0} vessels<br/>${text(obj.activityType)}</div>`,
        };
      case "military-flight-clusters-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name || "Flight Cluster")}</strong><br/>${obj.flightCount || 0} aircraft<br/>${text(obj.activityType)}</div>`,
        };
      case "protests-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.country)}</div>`,
        };
      case "protest-clusters-layer":
        if (obj.count === 1) {
          const item = obj.items?.[0];
          return {
            html: `<div class="deckgl-tooltip"><strong>${text(item?.title || "Protest")}</strong><br/>${text(item?.city || item?.country || "")}</div>`,
          };
        }
        return {
          html: `<div class="deckgl-tooltip"><strong>${obj.count} protests</strong><br/>${text(obj.country)}</div>`,
        };
      case "bases-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country)}</div>`,
        };
      case "nuclear-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)}</div>`,
        };
      case "pipelines-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)} Pipeline</div>`,
        };
      case "conflict-zones-layer": {
        const props = obj.properties || obj;
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(props.name)}</strong><br/>Conflict Zone</div>`,
        };
      }
      case "natural-events-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.category || "Natural Event")}</div>`,
        };
      case "ais-density-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>Ship Traffic</strong><br/>Intensity: ${text(obj.intensity)}</div>`,
        };
      case "waterways-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>Strategic Waterway</div>`,
        };
      case "economic-centers-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country)}</div>`,
        };
      case "ports-layer": {
        const typeIcon =
          obj.type === "naval"
            ? "⚓"
            : obj.type === "oil" || obj.type === "lng"
              ? "🛢️"
              : "🏭";
        return {
          html: `<div class="deckgl-tooltip"><strong>${typeIcon} ${text(obj.name)}</strong><br/>${text(obj.type || "Port")} - ${text(obj.country)}</div>`,
        };
      }
      case "minerals-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.mineral)} - ${text(obj.country)}<br/>${text(obj.operator)}</div>`,
        };
      case "ais-disruptions-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>AIS ${text(obj.type || "Disruption")}</strong><br/>${text(obj.severity)} severity<br/>${text(obj.description)}</div>`,
        };
      case "weather-layer": {
        const areaDesc = typeof obj.areaDesc === "string" ? obj.areaDesc : "";
        const area = areaDesc
          ? `<br/><small>${text(areaDesc.slice(0, 50))}${areaDesc.length > 50 ? "..." : ""}</small>`
          : "";
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.event || "Weather Alert")}</strong><br/>${text(obj.severity)}${area}</div>`,
        };
      }
      case "outages-layer":
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.asn || "Internet Outage")}</strong><br/>${text(obj.country)}</div>`,
        };
      default:
        return null;
    }
  }

  private handleClick(info: PickingInfo): void {
    if (!info.object) {
      // Empty map click → country detection
      if (info.coordinate && this.onCountryClick) {
        const [lon, lat] = info.coordinate as [number, number];
        this.onCountryClick(lat, lon);
      }
      return;
    }

    const rawClickLayerId = info.layer?.id || "";
    const layerId = rawClickLayerId.endsWith("-ghost")
      ? rawClickLayerId.slice(0, -6)
      : rawClickLayerId;

    // Hotspots show popup with related news
    if (layerId === "hotspots-layer") {
      const hotspot = info.object as Hotspot;
      const relatedNews = this.getRelatedNews(hotspot);
      this.popup.show({
        type: "hotspot",
        data: hotspot,
        relatedNews,
        x: info.x,
        y: info.y,
      });
      this.popup.loadHotspotGdeltContext(hotspot);
      this.onHotspotClick?.(hotspot);
      return;
    }

    // Handle cluster layers with single/multi logic
    if (layerId === "protest-clusters-layer") {
      const cluster = info.object as MapProtestCluster;
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({
          type: "protest",
          data: cluster.items[0],
          x: info.x,
          y: info.y,
        });
      } else {
        this.popup.show({
          type: "protestCluster",
          data: { items: cluster.items, country: cluster.country },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }
    // Map layer IDs to popup types
    const layerToPopupType: Record<string, PopupType> = {
      "conflict-zones-layer": "conflict",
      "bases-layer": "base",
      "nuclear-layer": "nuclear",
      "pipelines-layer": "pipeline",
      "earthquakes-layer": "earthquake",
      "weather-layer": "weather",
      "outages-layer": "outage",
      "protests-layer": "protest",
      "military-flights-layer": "militaryFlight",
      "military-vessels-layer": "militaryVessel",
      "military-vessel-clusters-layer": "militaryVesselCluster",
      "military-flight-clusters-layer": "militaryFlightCluster",
      "natural-events-layer": "natEvent",
      "waterways-layer": "waterway",
      "economic-centers-layer": "economic",
      "ports-layer": "port",
      "minerals-layer": "mineral",
      "ais-disruptions-layer": "ais",
    };

    const popupType = layerToPopupType[layerId];
    if (!popupType) return;

    // For GeoJSON layers, the data is in properties
    let data = info.object;
    if (layerId === "conflict-zones-layer" && info.object.properties) {
      // Find the full conflict zone data from config
      const conflictId = info.object.properties.id;
      const fullConflict = CONFLICT_ZONES.find((c) => c.id === conflictId);
      if (fullConflict) data = fullConflict;
    }

    // Get click coordinates relative to container
    const x = info.x ?? 0;
    const y = info.y ?? 0;

    this.popup.show({
      type: popupType,
      data: data,
      x,
      y,
    });
  }

  // Utility methods
  private hexToRgba(
    hex: string,
    alpha: number,
  ): [number, number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result && result[1] && result[2] && result[3]) {
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        alpha,
      ];
    }
    return [100, 100, 100, alpha];
  }

  // UI Creation methods
  private createControls(): void {
    const controls = document.createElement("div");
    controls.className = "map-controls deckgl-controls";
    controls.innerHTML = `
      <div class="zoom-controls">
        <button class="map-btn zoom-in" title="Zoom In">+</button>
        <button class="map-btn zoom-out" title="Zoom Out">-</button>
        <button class="map-btn zoom-reset" title="Reset View">&#8962;</button>
      </div>
      <div class="view-selector">
        <select class="view-select">
          <option value="global">Global</option>
          <option value="america">Americas</option>
          <option value="mena">MENA</option>
          <option value="eu">Europe</option>
          <option value="asia">Asia</option>
          <option value="latam">Latin America</option>
          <option value="africa">Africa</option>
          <option value="oceania">Oceania</option>
        </select>
      </div>
    `;

    this.container.appendChild(controls);

    // Bind events - use event delegation for reliability
    controls.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("zoom-in")) this.zoomIn();
      else if (target.classList.contains("zoom-out")) this.zoomOut();
      else if (target.classList.contains("zoom-reset")) this.resetView();
    });

    const viewSelect = controls.querySelector(
      ".view-select",
    ) as HTMLSelectElement;
    viewSelect.value = this.state.view;
    viewSelect.addEventListener("change", () => {
      this.setView(viewSelect.value as DeckMapView);
    });
  }

  private createTimeSlider(): void {
    const slider = document.createElement("div");
    slider.className = "time-slider deckgl-time-slider";
    slider.innerHTML = `
      <div class="time-options">
        <button class="time-btn ${this.state.timeRange === "1h" ? "active" : ""}" data-range="1h">1h</button>
        <button class="time-btn ${this.state.timeRange === "6h" ? "active" : ""}" data-range="6h">6h</button>
        <button class="time-btn ${this.state.timeRange === "24h" ? "active" : ""}" data-range="24h">24h</button>
        <button class="time-btn ${this.state.timeRange === "48h" ? "active" : ""}" data-range="48h">48h</button>
        <button class="time-btn ${this.state.timeRange === "7d" ? "active" : ""}" data-range="7d">7d</button>
        <button class="time-btn ${this.state.timeRange === "all" ? "active" : ""}" data-range="all">All</button>
      </div>
    `;

    this.container.appendChild(slider);

    slider.querySelectorAll(".time-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const range = (btn as HTMLElement).dataset.range as TimeRange;
        this.setTimeRange(range);
        slider
          .querySelectorAll(".time-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  private createLayerToggles(): void {
    const toggles = document.createElement("div");
    toggles.className = "layer-toggles deckgl-layer-toggles";

    const layerConfig = [
      { key: "hotspots", label: "Intel Hotspots", icon: "&#127919;" },
      { key: "conflicts", label: "Conflict Zones", icon: "&#9876;" },
      { key: "bases", label: "Military Bases", icon: "&#127963;" },
      { key: "nuclear", label: "Nuclear Sites", icon: "&#9762;" },
      { key: "pipelines", label: "Pipelines", icon: "&#128738;" },
      { key: "military", label: "Military Activity", icon: "&#9992;" },
      { key: "ais", label: "Ship Traffic", icon: "&#128674;" },
      { key: "protests", label: "Protests", icon: "&#128226;" },
      { key: "weather", label: "Weather Alerts", icon: "&#9928;" },
      { key: "outages", label: "Internet Outages", icon: "&#128225;" },
      { key: "natural", label: "Natural Events", icon: "&#127755;" },
      { key: "fires", label: "Fires", icon: "&#128293;" },
      { key: "waterways", label: "Strategic Waterways", icon: "&#9875;" },
      { key: "economic", label: "Economic Centers", icon: "&#128176;" },
      { key: "minerals", label: "Critical Minerals", icon: "&#128142;" },
    ];

    toggles.innerHTML = `
      <div class="toggle-header">
        <span>Layers</span>
        <button class="layer-help-btn" title="Layer Guide">?</button>
        <button class="toggle-collapse">&#9660;</button>
      </div>
      <div class="toggle-list">
        ${layerConfig
          .map(
            ({ key, label, icon }) => `
          <label class="layer-toggle" data-layer="${key}">
            <input type="checkbox" ${this.state.layers[key as keyof MapLayers] ? "checked" : ""}>
            <span class="toggle-icon">${icon}</span>
            <span class="toggle-label">${label}</span>
          </label>
        `,
          )
          .join("")}
      </div>
    `;

    this.container.appendChild(toggles);

    // Bind toggle events
    toggles.querySelectorAll(".layer-toggle input").forEach((input) => {
      input.addEventListener("change", () => {
        const layer = (input as HTMLInputElement)
          .closest(".layer-toggle")
          ?.getAttribute("data-layer") as keyof MapLayers;
        if (layer) {
          this.state.layers[layer] = (input as HTMLInputElement).checked;
          this.render();
          this.onLayerChange?.(layer, (input as HTMLInputElement).checked);
        }
      });
    });

    // Help button
    const helpBtn = toggles.querySelector(".layer-help-btn");
    helpBtn?.addEventListener("click", () => this.showLayerHelp());

    // Collapse toggle
    const collapseBtn = toggles.querySelector(".toggle-collapse");
    const toggleList = toggles.querySelector(".toggle-list");

    // Manual scroll: intercept wheel, prevent map zoom, scroll the list ourselves
    if (toggleList) {
      toggles.addEventListener(
        "wheel",
        (e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleList.scrollTop += e.deltaY;
        },
        { passive: false },
      );
      toggles.addEventListener("touchmove", (e) => e.stopPropagation(), {
        passive: false,
      });
    }
    collapseBtn?.addEventListener("click", () => {
      toggleList?.classList.toggle("collapsed");
      if (collapseBtn)
        collapseBtn.innerHTML = toggleList?.classList.contains("collapsed")
          ? "&#9654;"
          : "&#9660;";
    });
  }

  /** Show layer help popup explaining each layer */
  private showLayerHelp(): void {
    const existing = this.container.querySelector(".layer-help-popup");
    if (existing) {
      existing.remove();
      return;
    }

    const popup = document.createElement("div");
    popup.className = "layer-help-popup";

    const helpContent = `
      <div class="layer-help-header">
        <span>Map Layers Guide</span>
        <button class="layer-help-close">×</button>
      </div>
      <div class="layer-help-content">
        <div class="layer-help-section">
          <div class="layer-help-title">Time Filter (top-right)</div>
          <div class="layer-help-item"><span>1H/6H/24H</span> Filter time-based data to recent hours</div>
          <div class="layer-help-item"><span>7D/30D/ALL</span> Show data from past week, month, or all time</div>
          <div class="layer-help-note">Affects: Earthquakes, Weather, Protests, Outages</div>
        </div>
        <div class="layer-help-section">
          <div class="layer-help-title">Geopolitical</div>
          <div class="layer-help-item"><span>CONFLICTS</span> Active war zones (Ukraine, Gaza, etc.) with boundaries</div>
          <div class="layer-help-item"><span>HOTSPOTS</span> Tension regions - color-coded by news activity level</div>
          <div class="layer-help-item"><span>PROTESTS</span> Civil unrest, demonstrations (time-filtered)</div>
        </div>
        <div class="layer-help-section">
          <div class="layer-help-title">Military & Strategic</div>
          <div class="layer-help-item"><span>BASES</span> US/NATO, China, Russia military installations (150+)</div>
          <div class="layer-help-item"><span>NUCLEAR</span> Power plants, enrichment, weapons facilities</div>
          <div class="layer-help-item"><span>MILITARY</span> Live military aircraft and vessel tracking</div>
        </div>
        <div class="layer-help-section">
          <div class="layer-help-title">Infrastructure</div>
          <div class="layer-help-item"><span>PIPELINES</span> Oil/gas pipelines (Nord Stream, TAPI, etc.)</div>
          <div class="layer-help-item"><span>OUTAGES</span> Internet blackouts and disruptions</div>
        </div>
        <div class="layer-help-section">
          <div class="layer-help-title">Transport</div>
          <div class="layer-help-item"><span>SHIPPING</span> Vessels, chokepoints, 61 strategic ports</div>
        </div>
        <div class="layer-help-section">
          <div class="layer-help-title">Natural & Economic</div>
          <div class="layer-help-item"><span>NATURAL</span> Earthquakes (USGS) + storms, fires, volcanoes, floods (NASA EONET)</div>
          <div class="layer-help-item"><span>WEATHER</span> Severe weather alerts</div>
          <div class="layer-help-item"><span>ECONOMIC</span> Stock exchanges & central banks</div>
        </div>
        <div class="layer-help-section">
          <div class="layer-help-title">Labels</div>
          <div class="layer-help-item"><span>COUNTRIES</span> Country name overlays</div>
          <div class="layer-help-item"><span>WATERWAYS</span> Strategic chokepoint labels</div>
        </div>
      </div>
    `;

    popup.innerHTML = helpContent;

    popup
      .querySelector(".layer-help-close")
      ?.addEventListener("click", () => popup.remove());

    // Prevent scroll events from propagating to map
    const content = popup.querySelector(".layer-help-content");
    if (content) {
      content.addEventListener("wheel", (e) => e.stopPropagation(), {
        passive: false,
      });
      content.addEventListener("touchmove", (e) => e.stopPropagation(), {
        passive: false,
      });
    }

    // Close on click outside
    setTimeout(() => {
      const closeHandler = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node)) {
          popup.remove();
          document.removeEventListener("click", closeHandler);
        }
      };
      document.addEventListener("click", closeHandler);
    }, 100);

    this.container.appendChild(popup);
  }

  private createLegend(): void {
    const legend = document.createElement("div");
    legend.className = "map-legend deckgl-legend";

    // SVG shapes for different marker types
    const shapes = {
      circle: (color: string) =>
        `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="${color}"/></svg>`,
      triangle: (color: string) =>
        `<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 11,10 1,10" fill="${color}"/></svg>`,
      square: (color: string) =>
        `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="1" fill="${color}"/></svg>`,
      hexagon: (color: string) =>
        `<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 10.5,3.5 10.5,8.5 6,11 1.5,8.5 1.5,3.5" fill="${color}"/></svg>`,
    };

    const legendItems = [
      { shape: shapes.circle("rgb(255, 68, 68)"), label: "High Alert" },
      { shape: shapes.circle("rgb(255, 165, 0)"), label: "Elevated" },
      { shape: shapes.circle("rgb(255, 255, 0)"), label: "Monitoring" },
      { shape: shapes.triangle("rgb(68, 136, 255)"), label: "Base" },
      { shape: shapes.hexagon("rgb(255, 220, 0)"), label: "Nuclear" },
    ];

    legend.innerHTML = `
      <span class="legend-label-title">LEGEND</span>
      ${legendItems.map(({ shape, label }) => `<span class="legend-item">${shape}<span class="legend-label">${label}</span></span>`).join("")}
    `;

    this.container.appendChild(legend);
  }

  private createTimestamp(): void {
    const timestamp = document.createElement("div");
    // Only use deckgl-timestamp class - map-timestamp has conflicting positioning
    timestamp.className = "deckgl-timestamp";
    timestamp.id = "deckglTimestamp";
    this.container.appendChild(timestamp);

    this.updateTimestamp();
    this.timestampIntervalId = setInterval(() => this.updateTimestamp(), 1000);
  }

  private updateTimestamp(): void {
    const el = document.getElementById("deckglTimestamp");
    if (el) {
      const now = new Date();
      el.textContent = `${now.toUTCString().replace("GMT", "UTC")}`;
    }
  }

  // Public API methods (matching MapComponent interface)
  public render(): void {
    if (this.renderPaused) {
      this.renderPending = true;
      return;
    }
    if (this.renderScheduled) return;
    this.renderScheduled = true;

    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.updateLayers();
    });
  }

  public setRenderPaused(paused: boolean): void {
    this.renderPaused = paused;
    if (!paused && this.renderPending) {
      this.renderPending = false;
      this.render();
    }
  }

  private updateLayers(): void {
    const startTime = performance.now();
    if (this.deckOverlay) {
      this.deckOverlay.setProps({ layers: this.buildLayers() });
    }
    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(
        `[DeckGLMap] updateLayers took ${elapsed.toFixed(2)}ms (>16ms budget)`,
      );
    }
  }

  public setView(view: DeckMapView): void {
    this.state.view = view;
    const preset = VIEW_PRESETS[view];

    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [preset.longitude, preset.latitude],
        zoom: preset.zoom,
        duration: 1000,
      });
    }

    const viewSelect = this.container.querySelector(
      ".view-select",
    ) as HTMLSelectElement;
    if (viewSelect) viewSelect.value = view;

    this.onStateChange?.(this.state);
  }

  public setZoom(zoom: number): void {
    this.state.zoom = zoom;
    if (this.maplibreMap) {
      this.maplibreMap.setZoom(zoom);
    }
  }

  public setCenter(lat: number, lon: number, zoom?: number): void {
    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [lon, lat],
        ...(zoom != null && { zoom }),
        duration: 500,
      });
    }
  }

  public getCenter(): { lat: number; lon: number } | null {
    if (this.maplibreMap) {
      const center = this.maplibreMap.getCenter();
      return { lat: center.lat, lon: center.lng };
    }
    return null;
  }

  public setTimeRange(range: TimeRange): void {
    this.state.timeRange = range;
    this.onTimeRangeChange?.(range);
    this.render(); // Debounced
  }

  public getTimeRange(): TimeRange {
    return this.state.timeRange;
  }

  public setLayers(layers: MapLayers): void {
    this.state.layers = layers;
    this.render(); // Debounced

    // Update toggle checkboxes
    Object.entries(layers).forEach(([key, value]) => {
      const toggle = this.container.querySelector(
        `.layer-toggle[data-layer="${key}"] input`,
      ) as HTMLInputElement;
      if (toggle) toggle.checked = value;
    });
  }

  public getState(): DeckMapState {
    return { ...this.state };
  }

  // Zoom controls - public for external access
  public zoomIn(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomIn();
    }
  }

  public zoomOut(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomOut();
    }
  }

  private resetView(): void {
    this.setView("global");
  }

  // Data setters - all use render() for debouncing
  public setEarthquakes(earthquakes: Earthquake[]): void {
    this.earthquakes = earthquakes;
    this.render();
  }

  public setWeatherAlerts(alerts: WeatherAlert[]): void {
    this.weatherAlerts = alerts;
    const withCentroid = alerts.filter(
      (a) => a.centroid && a.centroid.length === 2,
    ).length;
    console.log(
      `[DeckGLMap] Weather alerts: ${alerts.length} total, ${withCentroid} with coordinates`,
    );
    this.render();
  }

  public setOutages(outages: InternetOutage[]): void {
    this.outages = outages;
    this.render();
  }

  public setAisData(
    disruptions: AisDisruptionEvent[],
    density: AisDensityZone[],
  ): void {
    this.aisDisruptions = disruptions;
    this.aisDensity = density;
    this.render();
  }

  public setProtests(events: SocialUnrestEvent[]): void {
    this.protests = events;
    this.rebuildProtestSupercluster();
    this.render();
    if (this.needsPulseAnimation() && this.newsPulseIntervalId === null) {
      this.startPulseAnimation();
    }
  }

  public setMilitaryFlights(
    flights: MilitaryFlight[],
    clusters: MilitaryFlightCluster[] = [],
  ): void {
    this.militaryFlights = flights;
    this.militaryFlightClusters = clusters;
    this.render();
  }

  public setMilitaryVessels(
    vessels: MilitaryVessel[],
    clusters: MilitaryVesselCluster[] = [],
  ): void {
    this.militaryVessels = vessels;
    this.militaryVesselClusters = clusters;
    this.render();
  }

  public setNaturalEvents(events: NaturalEvent[]): void {
    this.naturalEvents = events;
    this.render();
  }

  public setFires(
    fires: Array<{
      lat: number;
      lon: number;
      brightness: number;
      frp: number;
      confidence: number;
      region: string;
      acq_date: string;
      daynight: string;
    }>,
  ): void {
    this.firmsFireData = fires;
    this.render();
  }

  public updateHotspotActivity(news: NewsItem[]): void {
    this.news = news; // Store for related news lookup

    // Update hotspot "breaking" indicators based on recent news
    const breakingKeywords = new Set<string>();
    const recentNews = news.filter(
      (n) => Date.now() - n.pubDate.getTime() < 2 * 60 * 60 * 1000, // Last 2 hours
    );

    // Count matches per hotspot for escalation tracking
    const matchCounts = new Map<string, number>();

    recentNews.forEach((item) => {
      this.hotspots.forEach((hotspot) => {
        if (
          hotspot.keywords.some((kw) =>
            item.title.toLowerCase().includes(kw.toLowerCase()),
          )
        ) {
          breakingKeywords.add(hotspot.id);
          matchCounts.set(hotspot.id, (matchCounts.get(hotspot.id) || 0) + 1);
        }
      });
    });

    this.hotspots.forEach((h) => {
      h.hasBreaking = breakingKeywords.has(h.id);
      const matchCount = matchCounts.get(h.id) || 0;
      // Calculate a simple velocity metric (matches per hour normalized)
      const velocity = matchCount > 0 ? matchCount / 2 : 0; // 2 hour window
      updateHotspotEscalation(
        h.id,
        matchCount,
        h.hasBreaking || false,
        velocity,
      );
    });

    this.render();
    if (this.needsPulseAnimation() && this.newsPulseIntervalId === null) {
      this.startPulseAnimation();
    }
  }

  /** Get news items related to a hotspot by keyword matching */
  private getRelatedNews(hotspot: Hotspot): NewsItem[] {
    // High-priority conflict keywords that indicate the news is really about another topic
    const conflictTopics = [
      "gaza",
      "ukraine",
      "russia",
      "israel",
      "iran",
      "china",
      "taiwan",
      "korea",
      "syria",
    ];

    return this.news
      .map((item) => {
        const titleLower = item.title.toLowerCase();
        const matchedKeywords = hotspot.keywords.filter((kw) =>
          titleLower.includes(kw.toLowerCase()),
        );

        if (matchedKeywords.length === 0) return null;

        // Check if this news mentions other hotspot conflict topics
        const conflictMatches = conflictTopics.filter(
          (t) =>
            titleLower.includes(t) &&
            !hotspot.keywords.some((k) => k.toLowerCase().includes(t)),
        );

        // If article mentions a major conflict topic that isn't this hotspot, deprioritize heavily
        if (conflictMatches.length > 0) {
          // Only include if it ALSO has a strong local keyword (city name, agency)
          const strongLocalMatch = matchedKeywords.some(
            (kw) =>
              kw.toLowerCase() === hotspot.name.toLowerCase() ||
              hotspot.agencies?.some((a) =>
                titleLower.includes(a.toLowerCase()),
              ),
          );
          if (!strongLocalMatch) return null;
        }

        // Score: more keyword matches = more relevant
        const score = matchedKeywords.length;
        return { item, score };
      })
      .filter((x): x is { item: NewsItem; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.item);
  }

  public updateMilitaryForEscalation(
    flights: MilitaryFlight[],
    vessels: MilitaryVessel[],
  ): void {
    setMilitaryData(flights, vessels);
  }

  public getHotspotDynamicScore(hotspotId: string) {
    return getHotspotEscalation(hotspotId);
  }

  /** Get military flight clusters for rendering/analysis */
  public getMilitaryFlightClusters(): MilitaryFlightCluster[] {
    return this.militaryFlightClusters;
  }

  /** Get military vessel clusters for rendering/analysis */
  public getMilitaryVesselClusters(): MilitaryVesselCluster[] {
    return this.militaryVesselClusters;
  }

  public highlightAssets(assets: RelatedAsset[] | null): void {
    // Clear previous highlights
    Object.values(this.highlightedAssets).forEach((set) => set.clear());

    if (assets) {
      assets.forEach((asset) => {
        this.highlightedAssets[asset.type].add(asset.id);
      });
    }

    this.render(); // Debounced
  }

  public setOnHotspotClick(callback: (hotspot: Hotspot) => void): void {
    this.onHotspotClick = callback;
  }

  public setOnTimeRangeChange(callback: (range: TimeRange) => void): void {
    this.onTimeRangeChange = callback;
  }

  public setOnLayerChange(
    callback: (layer: keyof MapLayers, enabled: boolean) => void,
  ): void {
    this.onLayerChange = callback;
  }

  public setOnStateChange(callback: (state: DeckMapState) => void): void {
    this.onStateChange = callback;
  }

  public getHotspotLevels(): Record<string, string> {
    const levels: Record<string, string> = {};
    this.hotspots.forEach((h) => {
      levels[h.name] = h.level || "low";
    });
    return levels;
  }

  public setHotspotLevels(levels: Record<string, string>): void {
    this.hotspots.forEach((h) => {
      if (levels[h.name]) {
        h.level = levels[h.name] as "low" | "elevated" | "high";
      }
    });
    this.render(); // Debounced
  }

  public initEscalationGetters(): void {
    setCIIGetter(getCountryScore);
    setGeoAlertGetter(getAlertsNearLocation);
  }

  // UI visibility methods
  public hideLayerToggle(layer: keyof MapLayers): void {
    const toggle = this.container.querySelector(
      `.layer-toggle[data-layer="${layer}"]`,
    );
    if (toggle) (toggle as HTMLElement).style.display = "none";
  }

  public setLayerLoading(layer: keyof MapLayers, loading: boolean): void {
    const toggle = this.container.querySelector(
      `.layer-toggle[data-layer="${layer}"]`,
    );
    if (toggle) toggle.classList.toggle("loading", loading);
  }

  public setLayerReady(layer: keyof MapLayers, hasData: boolean): void {
    const toggle = this.container.querySelector(
      `.layer-toggle[data-layer="${layer}"]`,
    );
    if (!toggle) return;

    toggle.classList.remove("loading");
    // Match old Map.ts behavior: set 'active' only when layer enabled AND has data
    if (this.state.layers[layer] && hasData) {
      toggle.classList.add("active");
    } else {
      toggle.classList.remove("active");
    }
  }

  public flashAssets(assetType: AssetType, ids: string[]): void {
    // Temporarily highlight assets
    ids.forEach((id) => this.highlightedAssets[assetType].add(id));
    this.render();

    setTimeout(() => {
      ids.forEach((id) => this.highlightedAssets[assetType].delete(id));
      this.render();
    }, 3000);
  }

  // Enable layer programmatically
  public enableLayer(layer: keyof MapLayers): void {
    if (!this.state.layers[layer]) {
      this.state.layers[layer] = true;
      const toggle = this.container.querySelector(
        `.layer-toggle[data-layer="${layer}"] input`,
      ) as HTMLInputElement;
      if (toggle) toggle.checked = true;
      this.render();
      this.onLayerChange?.(layer, true);
    }
  }

  // Toggle layer on/off programmatically
  public toggleLayer(layer: keyof MapLayers): void {
    console.log(
      `[DeckGLMap.toggleLayer] ${layer}: ${this.state.layers[layer]} -> ${!this.state.layers[layer]}`,
    );
    this.state.layers[layer] = !this.state.layers[layer];
    const toggle = this.container.querySelector(
      `.layer-toggle[data-layer="${layer}"] input`,
    ) as HTMLInputElement;
    if (toggle) toggle.checked = this.state.layers[layer];
    this.render();
    this.onLayerChange?.(layer, this.state.layers[layer]);
  }

  // Get center coordinates for programmatic popup positioning
  private getContainerCenter(): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  // Project lat/lon to screen coordinates without moving the map
  private projectToScreen(
    lat: number,
    lon: number,
  ): { x: number; y: number } | null {
    if (!this.maplibreMap) return null;
    const point = this.maplibreMap.project([lon, lat]);
    return { x: point.x, y: point.y };
  }

  // Trigger click methods - show popup at item location without moving the map
  public triggerHotspotClick(id: string): void {
    const hotspot = this.hotspots.find((h) => h.id === id);
    if (!hotspot) return;

    // Get screen position for popup
    const screenPos = this.projectToScreen(hotspot.lat, hotspot.lon);
    const { x, y } = screenPos || this.getContainerCenter();

    // Get related news and show popup
    const relatedNews = this.getRelatedNews(hotspot);
    this.popup.show({
      type: "hotspot",
      data: hotspot,
      relatedNews,
      x,
      y,
    });
    this.popup.loadHotspotGdeltContext(hotspot);
    this.onHotspotClick?.(hotspot);
  }

  public triggerConflictClick(id: string): void {
    const conflict = CONFLICT_ZONES.find((c) => c.id === id);
    if (conflict) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(
        conflict.center[1],
        conflict.center[0],
      );
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: "conflict", data: conflict, x, y });
    }
  }

  public triggerBaseClick(id: string): void {
    const base = MILITARY_BASES.find((b) => b.id === id);
    if (base) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(base.lat, base.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: "base", data: base, x, y });
    }
  }

  public triggerPipelineClick(id: string): void {
    const pipeline = PIPELINES.find((p) => p.id === id);
    if (pipeline && pipeline.points.length > 0) {
      const midIdx = Math.floor(pipeline.points.length / 2);
      const midPoint = pipeline.points[midIdx];
      // Don't pan - show popup at projected screen position or center
      const screenPos = midPoint
        ? this.projectToScreen(midPoint[1], midPoint[0])
        : null;
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: "pipeline", data: pipeline, x, y });
    }
  }

  public triggerNuclearClick(id: string): void {
    const facility = NUCLEAR_FACILITIES.find((n) => n.id === id);
    if (facility) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(facility.lat, facility.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: "nuclear", data: facility, x, y });
    }
  }

  public flashLocation(lat: number, lon: number, durationMs = 2000): void {
    // Don't pan - project coordinates to screen position
    const screenPos = this.projectToScreen(lat, lon);
    if (!screenPos) return;

    // Flash effect by temporarily adding a highlight at the location
    const flashMarker = document.createElement("div");
    flashMarker.className = "flash-location-marker";
    flashMarker.style.cssText = `
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      border: 2px solid #fff;
      animation: flash-pulse 0.5s ease-out infinite;
      pointer-events: none;
      z-index: 1000;
      left: ${screenPos.x}px;
      top: ${screenPos.y}px;
      transform: translate(-50%, -50%);
    `;

    // Add animation keyframes if not present
    if (!document.getElementById("flash-animation-styles")) {
      const style = document.createElement("style");
      style.id = "flash-animation-styles";
      style.textContent = `
        @keyframes flash-pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    const wrapper = this.container.querySelector(".deckgl-map-wrapper");
    if (wrapper) {
      wrapper.appendChild(flashMarker);
      setTimeout(() => flashMarker.remove(), durationMs);
    }
  }

  // --- Country click + highlight ---

  public setOnCountryClick(cb: (lat: number, lon: number) => void): void {
    this.onCountryClick = cb;
  }

  private loadCountryBoundaries(): void {
    if (!this.maplibreMap || this.countryGeoJsonLoaded) return;
    this.countryGeoJsonLoaded = true;

    fetch("/data/countries.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        if (!this.maplibreMap) return;
        this.maplibreMap.addSource("country-boundaries", {
          type: "geojson",
          data: geojson,
        });
        this.maplibreMap.addLayer({
          id: "country-interactive",
          type: "fill",
          source: "country-boundaries",
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0,
          },
        });
        this.maplibreMap.addLayer({
          id: "country-hover-fill",
          type: "fill",
          source: "country-boundaries",
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.06,
          },
          filter: ["==", ["get", "name"], ""],
        });
        this.maplibreMap.addLayer({
          id: "country-highlight-fill",
          type: "fill",
          source: "country-boundaries",
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.12,
          },
          filter: ["==", ["get", "ISO3166-1-Alpha-2"], ""],
        });
        this.maplibreMap.addLayer({
          id: "country-highlight-border",
          type: "line",
          source: "country-boundaries",
          paint: {
            "line-color": "#3b82f6",
            "line-width": 1.5,
            "line-opacity": 0.5,
          },
          filter: ["==", ["get", "ISO3166-1-Alpha-2"], ""],
        });

        this.setupCountryHover();
        console.log("[DeckGLMap] Country boundaries loaded");
      })
      .catch((err) =>
        console.warn("[DeckGLMap] Failed to load country boundaries:", err),
      );
  }

  private setupCountryHover(): void {
    if (!this.maplibreMap) return;
    const map = this.maplibreMap;
    let hoveredName: string | null = null;

    map.on("mousemove", (e) => {
      if (!this.onCountryClick) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["country-interactive"],
      });
      const name = features?.[0]?.properties?.name as string | undefined;

      if (name && name !== hoveredName) {
        hoveredName = name;
        map.setFilter("country-hover-fill", ["==", ["get", "name"], name]);
        map.getCanvas().style.cursor = "pointer";
      } else if (!name && hoveredName) {
        hoveredName = null;
        map.setFilter("country-hover-fill", ["==", ["get", "name"], ""]);
        map.getCanvas().style.cursor = "";
      }
    });

    map.on("mouseout", () => {
      if (hoveredName) {
        hoveredName = null;
        map.setFilter("country-hover-fill", ["==", ["get", "name"], ""]);
        map.getCanvas().style.cursor = "";
      }
    });
  }

  public highlightCountry(code: string): void {
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return;
    // Update MapLibre filter to highlight this country
    const filter: maplibregl.FilterSpecification = [
      "==",
      ["get", "ISO3166-1-Alpha-2"],
      code,
    ];
    try {
      this.maplibreMap.setFilter("country-highlight-fill", filter);
      this.maplibreMap.setFilter("country-highlight-border", filter);
    } catch {
      /* layer not ready yet */
    }
  }

  public clearCountryHighlight(): void {
    if (!this.maplibreMap) return;
    // Clear highlight filter
    const noMatch: maplibregl.FilterSpecification = [
      "==",
      ["get", "ISO3166-1-Alpha-2"],
      "",
    ];
    try {
      this.maplibreMap.setFilter("country-highlight-fill", noMatch);
      this.maplibreMap.setFilter("country-highlight-border", noMatch);
    } catch {
      /* layer not ready */
    }
  }

  public destroy(): void {
    if (this.timestampIntervalId) {
      clearInterval(this.timestampIntervalId);
    }

    if (this.moveTimeoutId) {
      clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = null;
    }

    this.stopPulseAnimation();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.layerCache.clear();

    this.deckOverlay?.finalize();
    this.maplibreMap?.remove();

    this.container.innerHTML = "";
  }
}
