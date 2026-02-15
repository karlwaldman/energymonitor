// Well Permits Service
// Fetches well permit data from OPA via /api/opa-wells edge function

import type { WellPermit } from "@/types";

const WELLS_API = "/api/opa-wells";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour (matches edge function cache)

let cachedWells: WellPermit[] | null = null;
let cacheTimestamp = 0;

export async function fetchWellPermits(): Promise<WellPermit[]> {
  // Return cached data if fresh
  if (cachedWells && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedWells;
  }

  try {
    const res = await fetch(WELLS_API);
    if (!res.ok) {
      console.warn(`[Wells] API returned ${res.status}`);
      return cachedWells || [];
    }

    const data = await res.json();
    const wells: WellPermit[] = (data.wells || []).filter(
      (w: WellPermit) => w.lat !== 0 && w.lng !== 0,
    );

    cachedWells = wells;
    cacheTimestamp = Date.now();
    return wells;
  } catch (e) {
    console.warn("[Wells] Fetch failed:", e);
    return cachedWells || [];
  }
}

export function getWellStatusColor(status: string): [number, number, number] {
  switch (status) {
    case "approved":
    case "spudded":
      return [0, 200, 80]; // green
    case "completed":
      return [60, 120, 255]; // blue
    case "pending":
      return [255, 200, 0]; // yellow
    case "canceled":
    case "expired":
      return [150, 150, 150]; // gray
    default:
      return [200, 200, 200]; // light gray
  }
}
