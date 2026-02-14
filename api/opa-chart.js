// OilPriceAPI historical chart data proxy
// Free tier: last 7 days for demo commodities
// Paid tier: full history for all commodities
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
      {
        status: 405,
        headers: corsHeaders,
      },
    );
  }

  const url = new URL(req.url);
  const apiKey =
    url.searchParams.get("api_key") || req.headers.get("x-opa-key");
  const code = url.searchParams.get("code") || "BRENT_CRUDE_USD";
  const days = url.searchParams.get("days") || "30";

  try {
    let opaUrl;
    const fetchHeaders = { Accept: "application/json" };

    if (apiKey) {
      opaUrl = `${OPA_BASE}/v1/prices/historical/${encodeURIComponent(code)}?days=${days}`;
      fetchHeaders["Authorization"] = `Token ${apiKey}`;
    } else {
      // Free tier: use demo endpoint with limited history
      opaUrl = `${OPA_BASE}/v1/demo/prices`;
    }

    const response = await fetch(opaUrl, { headers: fetchHeaders });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        {
          error: "OPA API error",
          status: response.status,
          detail: errorText,
        },
        {
          status: response.status,
          headers: corsHeaders,
        },
      );
    }

    const data = await response.json();

    return Response.json(data, {
      headers: {
        ...corsHeaders,
        "Cache-Control":
          "public, max-age=1800, s-maxage=1800, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[OPA Chart] Fetch error:", error.message);
    return Response.json(
      { error: "Failed to fetch chart data" },
      {
        status: 502,
        headers: corsHeaders,
      },
    );
  }
}
