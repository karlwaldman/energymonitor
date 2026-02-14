# EnergyMonitor

**Real-time energy intelligence dashboard** — commodity prices, pipeline maps, vessel tracking, military activity, and AI-powered market intelligence in a unified situational awareness interface. Powered by [OilPriceAPI](https://oilpriceapi.com).

Fork of [koala73/worldmonitor](https://github.com/koala73/worldmonitor), refocused for energy sector intelligence.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## Why EnergyMonitor?

| Problem                                        | Solution                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Energy news scattered across dozens of sources | **Single dashboard** with 20+ curated energy, defense, and market feeds            |
| No geospatial context for supply disruptions   | **Interactive 3D globe** with pipelines, ports, shipping lanes, and conflict zones |
| Military activity affects energy supply chains | **Live military tracking** — flights, vessels, bases near strategic chokepoints    |
| Expensive energy intelligence tools            | **Free & open source** with OilPriceAPI integration                                |
| Information overload                           | **AI-synthesized briefs** with energy-focused focal point detection                |

---

## Key Features

### Interactive 3D Globe (deck.gl)

- **15+ energy & military data layers** — pipelines, ports, ship traffic (AIS), strategic waterways, military bases, military flights, naval vessels, conflict zones, nuclear sites, critical minerals, satellite fires, weather, outages, protests, economic centers
- **Smart clustering** with zoom-adaptive opacity and label deconfliction
- **Regional presets** — Global, Americas, Europe, MENA, Asia, Africa, Oceania
- **Time filtering** — 1h, 6h, 24h, 48h, 7d event windows
- **Shareable map state** via URL parameters

### Energy Market Intelligence

- **OilPriceAPI integration** — live commodity prices (WTI, Brent, Natural Gas, Gold)
- **Energy stocks** — XOM, CVX, COP, SLB, HAL, EOG, OXY, XLE, OIH
- **Market radar** — liquidity signals, flow alignment, macro regime detection
- **EIA data** — US Energy Information Administration reports

### AI-Powered Analysis

- **Energy Brief** — LLM-synthesized summary of top energy developments (Groq Llama 3.1)
- **Focal point detection** — correlates entities across news, military activity, protests, and markets
- **Country instability scoring** — real-time stability scores for energy-producing nations
- **Hybrid threat classification** — instant keyword classifier with async LLM refinement

### Military & Strategic Monitoring

- **220+ military bases** from 9 operators
- **Live military flight tracking** (ADS-B)
- **Naval vessel monitoring** (AIS) with surge detection
- **Strategic theater posture assessment** — Hormuz, Gulf of Aden, Suez, Black Sea
- **Infrastructure cascade modeling** — chokepoint disruption impact analysis

### Live News & Video

- **20+ RSS feeds** — energy, defense, Middle East, finance, think tanks
- **8 live video streams** — Bloomberg, Al Jazeera, Sky News, and more
- **Custom monitors** — keyword-based alerts for any energy topic

### Story Sharing & Social Export

- **Shareable intelligence stories** per country with instability scores and threat analysis
- **Multi-platform export** — Twitter/X, LinkedIn, WhatsApp, Telegram, Reddit, Facebook
- **Deep links** with dynamic Open Graph meta tags for rich social previews

---

## Quick Start

```bash
git clone https://github.com/karlwaldman/energymonitor.git
cd energymonitor
npm install
vercel dev       # Runs frontend + API edge functions
```

Open [http://localhost:3000](http://localhost:3000)

> **Note**: `vercel dev` requires the [Vercel CLI](https://vercel.com/docs/cli). If you use `npm run dev` instead, only the frontend starts — news feeds and API-dependent panels won't load.

### Environment Variables

The dashboard works without API keys — panels for unconfigured services simply won't appear. For full functionality:

```bash
cp .env.example .env.local
```

Key groups:

| Group            | Variables                                            | Free Tier             |
| ---------------- | ---------------------------------------------------- | --------------------- |
| **AI**           | `GROQ_API_KEY`, `OPENROUTER_API_KEY`                 | 14,400 req/day (Groq) |
| **Cache**        | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | 10K commands/day      |
| **Markets**      | `FINNHUB_API_KEY`, `FRED_API_KEY`, `EIA_API_KEY`     | All free tier         |
| **Tracking**     | `WINGBITS_API_KEY`, `AISSTREAM_API_KEY`              | Free                  |
| **Geopolitical** | `ACLED_ACCESS_TOKEN`, `NASA_FIRMS_API_KEY`           | Free for researchers  |

---

## Tech Stack

| Category        | Technologies                                                               |
| --------------- | -------------------------------------------------------------------------- |
| **Frontend**    | TypeScript, Vite, deck.gl (WebGL 3D globe), MapLibre GL, PWA               |
| **AI/ML**       | Groq (Llama 3.1 8B), OpenRouter (fallback), Transformers.js (browser-side) |
| **Caching**     | Redis (Upstash) — 3-tier cache, Vercel CDN, Service Worker                 |
| **Data APIs**   | OilPriceAPI, OpenSky, GDELT, ACLED, USGS, NASA FIRMS, EIA, FRED            |
| **Market APIs** | Yahoo Finance, Finnhub                                                     |
| **Deployment**  | Vercel Edge Functions + Railway (WebSocket relay)                          |

---

## Architecture

EnergyMonitor uses Vercel Edge Functions as a lightweight API layer. Each edge function handles a single data source — proxying, caching, or transforming external APIs. API keys stay server-side.

```
┌─────────────────────────────────┐
│        Vercel (Edge)            │
│  Edge functions · Static SPA   │
│  CORS allowlist · Redis cache  │
│  AI pipeline · Market data     │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│    Railway (Relay Server)       │
│  WebSocket relay · AIS stream  │
│  OpenSky OAuth2 · RSS proxy    │
└─────────────────────────────────┘
```

---

## OilPriceAPI Integration

EnergyMonitor serves as a top-of-funnel intelligence tool for [OilPriceAPI](https://oilpriceapi.com) — the commodity price data API for energy companies, trading desks, and financial applications.

The OPA Prices panel displays live commodity data directly from OilPriceAPI, demonstrating the API's capabilities in a real-world dashboard context.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Based on [worldmonitor](https://github.com/koala73/worldmonitor) by Elie Habib.
