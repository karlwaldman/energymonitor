// OilPriceAPI futures curve proxy
// Requires authenticated OPA API key
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

  if (!apiKey) {
    return Response.json(
      {
        error: "API key required",
        message:
          "Futures data requires an OilPriceAPI key. Get one free at oilpriceapi.com",
      },
      {
        status: 401,
        headers: corsHeaders,
      },
    );
  }

  try {
    const opaUrl = `${OPA_BASE}/v1/futures/${encodeURIComponent(code)}`;
    const response = await fetch(opaUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
    });

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
          "public, max-age=600, s-maxage=600, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("[OPA Futures] Fetch error:", error.message);
    return Response.json(
      { error: "Failed to fetch futures data" },
      {
        status: 502,
        headers: corsHeaders,
      },
    );
  }
}
