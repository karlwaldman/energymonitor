// OilPriceAPI monthly forecasts proxy
// Public endpoint - no auth required
import { getCorsHeaders } from "./_cors.js";

export const config = { runtime: "edge" };

const OPA_BASE = "https://api.oilpriceapi.com";

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const response = await fetch(`${OPA_BASE}/v1/forecasts/monthly`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: "OPA API error", status: response.status, detail: errorText },
        { status: response.status, headers: corsHeaders },
      );
    }

    const data = await response.json();

    return Response.json(data, {
      headers: {
        ...corsHeaders,
        "Cache-Control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[OPA Forecasts] Fetch error:", error.message);
    return Response.json(
      { error: "Failed to fetch forecast data" },
      { status: 502, headers: corsHeaders },
    );
  }
}
