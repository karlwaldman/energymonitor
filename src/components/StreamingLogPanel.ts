import { Panel } from "./Panel";
import { formatTime } from "@/utils";
import { escapeHtml } from "@/utils/sanitize";

/** Event source categories for color-coding */
export type EventSourceType =
  | "conflict"
  | "earthquake"
  | "fire"
  | "weather"
  | "military"
  | "outage"
  | "shipping"
  | "news"
  | "volcano"
  | "natural"
  | "economic"
  | "intel";

/** A single event entry in the streaming log */
export interface StreamingLogEvent {
  id: string;
  timestamp: Date;
  source: EventSourceType;
  title: string;
  location?: string;
  severity?: "low" | "medium" | "high" | "critical";
  lat?: number;
  lon?: number;
}

/** Source display configuration */
const SOURCE_CONFIG: Record<
  EventSourceType,
  { label: string; color: string; icon: string }
> = {
  conflict: { label: "CONFLICT", color: "#ff4444", icon: "⚔" },
  earthquake: { label: "QUAKE", color: "#ff8800", icon: "🔸" },
  fire: { label: "FIRE", color: "#ff6600", icon: "🔥" },
  weather: { label: "WEATHER", color: "#4488ff", icon: "⛈" },
  military: { label: "MILITARY", color: "#9944ff", icon: "✈" },
  outage: { label: "OUTAGE", color: "#ff44ff", icon: "⚡" },
  shipping: { label: "SHIPPING", color: "#00bbff", icon: "🚢" },
  news: { label: "NEWS", color: "#44cc44", icon: "📰" },
  volcano: { label: "VOLCANO", color: "#cc0000", icon: "🌋" },
  natural: { label: "NATURAL", color: "#ffbb00", icon: "🌀" },
  economic: { label: "ECON", color: "#00cc88", icon: "📊" },
  intel: { label: "INTEL", color: "#ff00aa", icon: "🔍" },
};

const MAX_EVENTS = 300;

export class StreamingLogPanel extends Panel {
  private events: StreamingLogEvent[] = [];
  private seenIds = new Set<string>();
  private listEl: HTMLElement | null = null;
  private autoScroll = true;
  private newEventCount = 0;
  private resumeBtn: HTMLElement | null = null;
  private isPaused = false;
  private filterSource: EventSourceType | null = null;
  private filterBar: HTMLElement | null = null;

  constructor() {
    super({
      id: "live-news",
      title: "Event Stream",
      showCount: true,
      trackActivity: true,
    });
    this.buildUI();
  }

  private buildUI(): void {
    // Clear loading state
    this.content.innerHTML = "";
    this.content.classList.add("streaming-log-content");

    // Filter bar
    this.filterBar = document.createElement("div");
    this.filterBar.className = "streaming-log-filters";
    this.buildFilterBar();
    this.element.insertBefore(this.filterBar, this.content);

    // Event list container
    this.listEl = document.createElement("div");
    this.listEl.className = "streaming-log-list";
    this.content.appendChild(this.listEl);

    // "New events" resume button (hidden by default)
    this.resumeBtn = document.createElement("button");
    this.resumeBtn.className = "streaming-log-resume";
    this.resumeBtn.style.display = "none";
    this.resumeBtn.addEventListener("click", () => this.resumeAutoScroll());
    this.content.appendChild(this.resumeBtn);

    // Track scroll to detect user scrolling up
    this.content.addEventListener("scroll", () => {
      const el = this.content;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (atBottom) {
        this.autoScroll = true;
        this.isPaused = false;
        this.newEventCount = 0;
        if (this.resumeBtn) this.resumeBtn.style.display = "none";
      } else if (!this.isPaused) {
        this.autoScroll = false;
        this.isPaused = true;
      }
    });

    // Show empty state
    this.showEmptyState();
    this.setDataBadge("live");
  }

  private buildFilterBar(): void {
    if (!this.filterBar) return;
    this.filterBar.innerHTML = "";

    // "All" button
    const allBtn = document.createElement("button");
    allBtn.className = `streaming-filter-btn${this.filterSource === null ? " active" : ""}`;
    allBtn.textContent = "All";
    allBtn.addEventListener("click", () => {
      this.filterSource = null;
      this.buildFilterBar();
      this.renderEvents();
    });
    this.filterBar.appendChild(allBtn);

    // Count events per source for active filters only
    const sourceCounts = new Map<EventSourceType, number>();
    for (const event of this.events) {
      sourceCounts.set(event.source, (sourceCounts.get(event.source) || 0) + 1);
    }

    // Add buttons for sources that have events
    for (const [source, count] of sourceCounts) {
      const cfg = SOURCE_CONFIG[source];
      const btn = document.createElement("button");
      btn.className = `streaming-filter-btn${this.filterSource === source ? " active" : ""}`;
      btn.style.setProperty("--filter-color", cfg.color);
      btn.innerHTML = `${cfg.icon} ${cfg.label} <span class="filter-count">${count}</span>`;
      btn.addEventListener("click", () => {
        this.filterSource = this.filterSource === source ? null : source;
        this.buildFilterBar();
        this.renderEvents();
      });
      this.filterBar.appendChild(btn);
    }
  }

  private showEmptyState(): void {
    if (!this.listEl) return;
    this.listEl.innerHTML = `<div class="streaming-log-empty">Waiting for events...</div>`;
  }

  /**
   * Add events to the streaming log.
   * Deduplicates by event ID.
   */
  public addEvents(events: StreamingLogEvent[]): void {
    let added = 0;
    for (const event of events) {
      if (this.seenIds.has(event.id)) continue;
      this.seenIds.add(event.id);
      this.events.push(event);
      added++;
    }

    if (added === 0) return;

    // Sort by timestamp descending (newest first)
    this.events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Trim to max
    while (this.events.length > MAX_EVENTS) {
      const removed = this.events.pop();
      if (removed) this.seenIds.delete(removed.id);
    }

    // Update count
    this.setCount(this.events.length);

    // Update filter bar (new sources may have appeared)
    this.buildFilterBar();

    // Track new events when paused
    if (this.isPaused) {
      this.newEventCount += added;
      this.showResumeButton();
    }

    this.renderEvents();

    // Auto-scroll to top (newest events)
    if (this.autoScroll) {
      this.content.scrollTop = 0;
    }
  }

  private showResumeButton(): void {
    if (!this.resumeBtn) return;
    this.resumeBtn.textContent = `↑ ${this.newEventCount} new event${this.newEventCount !== 1 ? "s" : ""}`;
    this.resumeBtn.style.display = "flex";
  }

  private resumeAutoScroll(): void {
    this.autoScroll = true;
    this.isPaused = false;
    this.newEventCount = 0;
    if (this.resumeBtn) this.resumeBtn.style.display = "none";
    this.content.scrollTop = 0;
  }

  private renderEvents(): void {
    if (!this.listEl) return;

    const filtered = this.filterSource
      ? this.events.filter((e) => e.source === this.filterSource)
      : this.events;

    if (filtered.length === 0) {
      this.showEmptyState();
      return;
    }

    const html = filtered.map((event) => this.renderEventEntry(event)).join("");
    this.listEl.innerHTML = html;
  }

  private renderEventEntry(event: StreamingLogEvent): string {
    const cfg = SOURCE_CONFIG[event.source];
    const timeStr = this.formatLogTime(event.timestamp);
    const severityClass = event.severity ? ` severity-${event.severity}` : "";
    const locationHtml = event.location
      ? `<span class="log-location">${escapeHtml(event.location)}</span>`
      : "";

    return `
      <div class="streaming-log-entry${severityClass}" style="--source-color: ${cfg.color}">
        <span class="log-time">${timeStr}</span>
        <span class="log-source" style="color: ${cfg.color}">${cfg.icon} ${cfg.label}</span>
        <span class="log-title">${escapeHtml(event.title)}</span>
        ${locationHtml}
      </div>
    `;
  }

  private formatLogTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // If less than 24h old, show HH:MM
    if (diff < 86400000) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    // Otherwise show relative time
    return formatTime(date);
  }

  /**
   * Clear all events
   */
  public clear(): void {
    this.events = [];
    this.seenIds.clear();
    this.newEventCount = 0;
    this.setCount(0);
    this.buildFilterBar();
    this.showEmptyState();
  }

  public destroy(): void {
    this.events = [];
    this.seenIds.clear();
    super.destroy();
  }
}
