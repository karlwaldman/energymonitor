export const config = { runtime: "edge" };

import { getCorsHeaders, isDisallowedOrigin } from "./_cors.js";

const CACHE_TTL = 300;
let cachedResponse = null;
let cacheTimestamp = 0;

async function fetchJSON(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function rateOfChange(prices, days) {
  if (!prices || prices.length < days + 1) return null;
  const recent = prices[prices.length - 1];
  const past = prices[prices.length - 1 - days];
  if (!past || past === 0) return null;
  return ((recent - past) / past) * 100;
}

function extractClosePrices(chart) {
  try {
    const result = chart?.chart?.result?.[0];
    return (
      result?.indicators?.quote?.[0]?.close?.filter((p) => p != null) || []
    );
  } catch {
    return [];
  }
}

function buildFallbackResult() {
  return {
    timestamp: new Date().toISOString(),
    verdict: "UNKNOWN",
    bullishCount: 0,
    totalCount: 0,
    signals: {
      liquidity: { status: "UNKNOWN", value: null, sparkline: [] },
      flowStructure: { status: "UNKNOWN", xleReturn5: null, qqqReturn5: null },
      macroRegime: { status: "UNKNOWN", qqqRoc20: null, xlpRoc20: null },
    },
    meta: { qqqSparkline: [] },
    unavailable: true,
  };
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    if (isDisallowedOrigin(req)) {
      return new Response(null, { status: 403, headers: cors });
    }
    return new Response(null, { status: 204, headers: cors });
  }
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  if (cachedResponse && now - cacheTimestamp < CACHE_TTL * 1000) {
    return new Response(JSON.stringify(cachedResponse), {
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=600`,
      },
    });
  }

  try {
    const yahooBase = "https://query1.finance.yahoo.com/v8/finance/chart";
    const [jpyChart, xleChart, qqqChart, xlpChart] = await Promise.allSettled([
      fetchJSON(`${yahooBase}/JPY=X?range=1y&interval=1d`),
      fetchJSON(`${yahooBase}/XLE?range=1y&interval=1d`),
      fetchJSON(`${yahooBase}/QQQ?range=1y&interval=1d`),
      fetchJSON(`${yahooBase}/XLP?range=1y&interval=1d`),
    ]);

    const jpyPrices =
      jpyChart.status === "fulfilled" ? extractClosePrices(jpyChart.value) : [];
    const xlePrices =
      xleChart.status === "fulfilled" ? extractClosePrices(xleChart.value) : [];
    const qqqPrices =
      qqqChart.status === "fulfilled" ? extractClosePrices(qqqChart.value) : [];
    const xlpPrices =
      xlpChart.status === "fulfilled" ? extractClosePrices(xlpChart.value) : [];

    // 1. Liquidity Signal (JPY 30d ROC)
    const jpyRoc30 = rateOfChange(jpyPrices, 30);
    const liquidityStatus =
      jpyRoc30 !== null ? (jpyRoc30 < -2 ? "SQUEEZE" : "NORMAL") : "UNKNOWN";

    // 2. Flow Structure (XLE vs QQQ 5d return — energy vs growth)
    const xleReturn5 = rateOfChange(xlePrices, 5);
    const qqqReturn5 = rateOfChange(qqqPrices, 5);
    let flowStatus = "UNKNOWN";
    if (xleReturn5 !== null && qqqReturn5 !== null) {
      const gap = xleReturn5 - qqqReturn5;
      flowStatus = Math.abs(gap) > 5 ? "PASSIVE GAP" : "ALIGNED";
    }

    // 3. Macro Regime (QQQ/XLP 20d ROC)
    const qqqRoc20 = rateOfChange(qqqPrices, 20);
    const xlpRoc20 = rateOfChange(xlpPrices, 20);
    let regimeStatus = "UNKNOWN";
    if (qqqRoc20 !== null && xlpRoc20 !== null) {
      regimeStatus = qqqRoc20 > xlpRoc20 ? "RISK-ON" : "DEFENSIVE";
    }

    // Sparkline data
    const qqqSparkline = qqqPrices.slice(-30);
    const jpySparkline = jpyPrices.slice(-30);

    // Overall Verdict
    let bullishCount = 0;
    let totalCount = 0;
    const signals = [
      {
        name: "Liquidity",
        status: liquidityStatus,
        bullish: liquidityStatus === "NORMAL",
      },
      {
        name: "Flow Structure",
        status: flowStatus,
        bullish: flowStatus === "ALIGNED",
      },
      {
        name: "Macro Regime",
        status: regimeStatus,
        bullish: regimeStatus === "RISK-ON",
      },
    ];

    for (const s of signals) {
      if (s.status !== "UNKNOWN") {
        totalCount++;
        if (s.bullish) bullishCount++;
      }
    }

    const verdict =
      totalCount === 0
        ? "UNKNOWN"
        : bullishCount / totalCount >= 0.57
          ? "BUY"
          : "CASH";

    const result = {
      timestamp: new Date().toISOString(),
      verdict,
      bullishCount,
      totalCount,
      signals: {
        liquidity: {
          status: liquidityStatus,
          value: jpyRoc30 !== null ? +jpyRoc30.toFixed(2) : null,
          sparkline: jpySparkline,
        },
        flowStructure: {
          status: flowStatus,
          xleReturn5: xleReturn5 !== null ? +xleReturn5.toFixed(2) : null,
          qqqReturn5: qqqReturn5 !== null ? +qqqReturn5.toFixed(2) : null,
        },
        macroRegime: {
          status: regimeStatus,
          qqqRoc20: qqqRoc20 !== null ? +qqqRoc20.toFixed(2) : null,
          xlpRoc20: xlpRoc20 !== null ? +xlpRoc20.toFixed(2) : null,
        },
      },
      meta: { qqqSparkline },
    };

    cachedResponse = result;
    cacheTimestamp = now;

    return new Response(JSON.stringify(result), {
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=600`,
      },
    });
  } catch (err) {
    const fallback = cachedResponse || buildFallbackResult();
    cachedResponse = fallback;
    cacheTimestamp = now;
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control":
          "public, max-age=30, s-maxage=60, stale-while-revalidate=30",
      },
    });
  }
}
