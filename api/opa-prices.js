// OilPriceAPI commodity prices proxy
// Free tier: /v1/demo/prices (no auth, 9 commodities, rate-limited)
// Paid tier: forwards user's OPA API key to authenticated endpoints
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

  try {
    let opaUrl;
    const fetchHeaders = { Accept: "application/json" };

    if (apiKey) {
      // Paid tier: authenticated endpoint with full commodity list
      opaUrl = `${OPA_BASE}/v1/prices/latest`;
      fetchHeaders["Authorization"] = `Token ${apiKey}`;
    } else {
      // Free tier: demo endpoint, limited to 9 commodities
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
          "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[OPA Prices] Fetch error:", error.message);
    return Response.json(
      { error: "Failed to fetch commodity prices" },
      {
        status: 502,
        headers: corsHeaders,
      },
    );
  }
}
