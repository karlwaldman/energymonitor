import { Panel } from "./Panel";
import { escapeHtml } from "@/utils/sanitize";

interface OPAPrice {
  code: string;
  name: string;
  price: number;
  currency: string;
  updated_at: string;
  change_24h: number;
  source: string;
}

interface OPAPricesResponse {
  status: string;
  data: {
    prices: OPAPrice[];
  };
}

// Category grouping for display
const CATEGORY_ORDER: Record<string, string[]> = {
  "Crude Oil": [
    "BRENT_CRUDE_USD",
    "WTI_USD",
    "DUBAI_CRUDE_USD",
    "OPEC_BASKET_USD",
    "MURBAN_CRUDE_USD",
  ],
  "Natural Gas": ["NATURAL_GAS_USD", "DUTCH_TTF_EUR"],
  "Precious Metals": ["GOLD_USD", "SILVER_USD"],
};

function getCategoryForCode(code: string): string {
  for (const [cat, codes] of Object.entries(CATEGORY_ORDER)) {
    if (codes.includes(code)) return cat;
  }
  return "Other";
}

function formatOPAPrice(price: number, currency: string): string {
  const symbol = currency === "EUR" ? "\u20AC" : "$";
  if (price >= 1000) {
    return `${symbol}${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `${symbol}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

function getChangeClass(change: number): string {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export class OPAPricesPanel extends Panel {
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: "opa-prices",
      title: "Commodity Prices",
      infoTooltip:
        "Live commodity prices from OilPriceAPI. Free tier shows 9 commodities.",
    });
    this.fetchPrices();
    this.refreshInterval = setInterval(() => this.fetchPrices(), 5 * 60 * 1000);
  }

  public destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async fetchPrices(): Promise<void> {
    try {
      const apiKey = localStorage.getItem("opa-api-key") || "";
      const url = apiKey
        ? `/api/opa-prices?api_key=${encodeURIComponent(apiKey)}`
        : "/api/opa-prices";

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: OPAPricesResponse = await response.json();
      if (data.status === "success" && data.data?.prices) {
        this.renderPrices(data.data.prices);
      } else {
        this.showError("Invalid response from price API");
      }
    } catch (error) {
      console.error("[OPA Prices] Fetch error:", error);
      this.showError("Failed to load commodity prices");
    }
  }

  private renderPrices(prices: OPAPrice[]): void {
    if (prices.length === 0) {
      this.showError("No price data available");
      return;
    }

    // Group by category
    const grouped: Record<string, OPAPrice[]> = {};
    for (const price of prices) {
      const cat = getCategoryForCode(price.code);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(price);
    }

    // Render in category order, then any remaining
    const orderedCategories = [...Object.keys(CATEGORY_ORDER)];
    for (const cat of Object.keys(grouped)) {
      if (!orderedCategories.includes(cat)) orderedCategories.push(cat);
    }

    let html = '<div class="opa-prices">';

    for (const cat of orderedCategories) {
      const items = grouped[cat];
      if (!items || items.length === 0) continue;

      html += `<div class="opa-category">`;
      html += `<div class="opa-category-label">${escapeHtml(cat)}</div>`;

      for (const item of items) {
        const changeClass = getChangeClass(item.change_24h);
        html += `
          <div class="opa-price-row">
            <div class="opa-price-info">
              <span class="opa-price-name">${escapeHtml(item.name)}</span>
              <span class="opa-price-updated">${timeAgo(item.updated_at)}</span>
            </div>
            <div class="opa-price-data">
              <span class="opa-price-value">${formatOPAPrice(item.price, item.currency)}</span>
              <span class="opa-price-change ${changeClass}">${formatChange(item.change_24h)}</span>
            </div>
          </div>`;
      }

      html += "</div>";
    }

    // CTA for free tier
    const apiKey = localStorage.getItem("opa-api-key");
    if (!apiKey) {
      html += `
        <div class="opa-cta">
          <a href="https://oilpriceapi.com?ref=energymonitor" target="_blank" rel="noopener">
            Get 50+ commodities with OilPriceAPI &rarr;
          </a>
        </div>`;
    }

    html += "</div>";
    this.setContent(html);
    this.setCount(prices.length);
  }
}
