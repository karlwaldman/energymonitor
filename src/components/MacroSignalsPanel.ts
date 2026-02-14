import { Panel } from "./Panel";
import { escapeHtml } from "@/utils/sanitize";

interface MacroSignalData {
  timestamp: string;
  verdict: string;
  bullishCount: number;
  totalCount: number;
  signals: {
    liquidity: { status: string; value: number | null; sparkline: number[] };
    flowStructure: {
      status: string;
      xleReturn5: number | null;
      qqqReturn5: number | null;
    };
    macroRegime: {
      status: string;
      qqqRoc20: number | null;
      xlpRoc20: number | null;
    };
  };
  meta: { qqqSparkline: number[] };
}

function sparklineSvg(
  data: number[],
  width = 80,
  height = 24,
  color = "#4fc3f7",
): string {
  if (!data || data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="signal-sparkline"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (["BULLISH", "RISK-ON", "GROWING", "ALIGNED", "NORMAL"].includes(s))
    return "badge-bullish";
  if (
    ["BEARISH", "DEFENSIVE", "DECLINING", "SQUEEZE", "PASSIVE GAP"].includes(s)
  )
    return "badge-bearish";
  return "badge-neutral";
}

function formatNum(v: number | null, suffix = "%"): string {
  if (v === null) return "N/A";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}${suffix}`;
}

export class MacroSignalsPanel extends Panel {
  private data: MacroSignalData | null = null;
  private loading = true;
  private error: string | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: "macro-signals", title: "Market Radar", showCount: false });
    void this.fetchData();
    this.refreshInterval = setInterval(() => this.fetchData(), 3 * 60000);
  }

  public destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async fetchData(): Promise<void> {
    try {
      const res = await fetch("/api/macro-signals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.data = await res.json();
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to fetch";
    } finally {
      this.loading = false;
      this.renderPanel();
    }
  }

  private renderPanel(): void {
    if (this.loading) {
      this.showLoading("Computing signals...");
      return;
    }

    if (this.error || !this.data) {
      this.showError(this.error || "No data");
      return;
    }

    const d = this.data;
    const s = d.signals;

    const verdictClass =
      d.verdict === "BUY"
        ? "verdict-buy"
        : d.verdict === "CASH"
          ? "verdict-cash"
          : "verdict-unknown";

    const html = `
      <div class="macro-signals-container">
        <div class="macro-verdict ${verdictClass}">
          <span class="verdict-label">Overall</span>
          <span class="verdict-value">${escapeHtml(d.verdict)}</span>
          <span class="verdict-detail">${d.bullishCount}/${d.totalCount} bullish</span>
        </div>
        <div class="signals-grid">
          ${this.renderSignalCard("Liquidity", s.liquidity.status, formatNum(s.liquidity.value), sparklineSvg(s.liquidity.sparkline, 60, 20, "#4fc3f7"), "JPY 30d ROC", "https://www.tradingview.com/symbols/JPYUSD/")}
          ${this.renderSignalCard("Flow", s.flowStructure.status, `XLE ${formatNum(s.flowStructure.xleReturn5)} / QQQ ${formatNum(s.flowStructure.qqqReturn5)}`, "", "5d returns", null)}
          ${this.renderSignalCard("Regime", s.macroRegime.status, `QQQ ${formatNum(s.macroRegime.qqqRoc20)} / XLP ${formatNum(s.macroRegime.xlpRoc20)}`, sparklineSvg(d.meta.qqqSparkline, 60, 20, "#ab47bc"), "20d ROC", "https://www.tradingview.com/symbols/QQQ/")}
        </div>
      </div>
    `;

    this.setContent(html);
  }

  private renderSignalCard(
    name: string,
    status: string,
    value: string,
    sparkline: string,
    detail: string,
    link: string | null,
  ): string {
    const badgeClass = statusBadgeClass(status);
    return `
      <div class="signal-card${link ? " signal-card-linked" : ""}">
        <div class="signal-header">
          ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="signal-name signal-card-link">${escapeHtml(name)}</a>` : `<span class="signal-name">${escapeHtml(name)}</span>`}
          <span class="signal-badge ${badgeClass}">${escapeHtml(status)}</span>
        </div>
        <div class="signal-body">
          ${sparkline ? `<div class="signal-sparkline-wrap">${sparkline}</div>` : ""}
          ${value ? `<span class="signal-value">${value}</span>` : ""}
        </div>
        ${detail ? `<div class="signal-detail">${escapeHtml(detail)}</div>` : ""}
      </div>
    `;
  }
}
