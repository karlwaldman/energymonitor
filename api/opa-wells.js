// OilPriceAPI well permits proxy
// Fetches latest well permits via server-side API key
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

  const apiKey = process.env.OPA_WELLS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Well permits API not configured" },
      { status: 503, headers: corsHeaders },
    );
  }

  try {
    const opaUrl = `${OPA_BASE}/v1/ei/well-permits/latest?days=30&per_page=100`;
    const response = await fetch(opaUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Token ${apiKey.trim()}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[OPA Wells] API error:", response.status, errorText);
      return Response.json(
        { error: "OPA API error", status: response.status },
        { status: response.status, headers: corsHeaders },
      );
    }

    const data = await response.json();

    // Map to lightweight format for the frontend
    const wells = (data.data || data.well_permits || []).map((w) => ({
      lat: parseFloat(w.latitude) || 0,
      lng: parseFloat(w.longitude) || 0,
      state: w.state || "",
      operator: w.operator || "Unknown",
      type: w.well_type || w.type || "",
      status: (w.status || "").toLowerCase(),
      date: w.permit_date || w.date || "",
      formation: w.formation || "",
    }));

    return Response.json(
      { wells },
      {
        headers: {
          ...corsHeaders,
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      },
    );
  } catch (error) {
    console.error("[OPA Wells] Fetch error:", error.message);
    return Response.json(
      { error: "Failed to fetch well permits" },
      { status: 502, headers: corsHeaders },
    );
  }
}
