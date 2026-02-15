// OilPriceAPI energy news proxy
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
      { status: 405, headers: corsHeaders },
    );
  }

  const url = new URL(req.url);
  const apiKey =
    url.searchParams.get("api_key") || req.headers.get("x-opa-key");
  const limit = url.searchParams.get("limit") || "20";
  const hours = url.searchParams.get("hours") || "48";
  const commodity = url.searchParams.get("commodity") || "";
  const sentiment = url.searchParams.get("sentiment") || "";

  if (!apiKey) {
    return Response.json(
      {
        error: "API key required",
        message:
          "Energy news requires an OilPriceAPI key. Get one free at oilpriceapi.com",
      },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const params = new URLSearchParams({ limit, hours });
    if (commodity) params.set("commodity", commodity);
    if (sentiment) params.set("sentiment", sentiment);

    const opaUrl = `${OPA_BASE}/v1/context/market/news?${params}`;
    const response = await fetch(opaUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
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
          "public, max-age=900, s-maxage=900, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("[OPA News] Fetch error:", error.message);
    return Response.json(
      { error: "Failed to fetch news data" },
      { status: 502, headers: corsHeaders },
    );
  }
}
