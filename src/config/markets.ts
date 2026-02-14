import type { Sector, Commodity, MarketSymbol } from "@/types";
import { SITE_VARIANT } from "./variant";

const FULL_SECTORS: Sector[] = [
  { symbol: "XLK", name: "Tech" },
  { symbol: "XLF", name: "Finance" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLV", name: "Health" },
  { symbol: "XLY", name: "Consumer" },
  { symbol: "XLI", name: "Industrial" },
  { symbol: "XLP", name: "Staples" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLRE", name: "Real Est" },
  { symbol: "XLC", name: "Comms" },
  { symbol: "SMH", name: "Semis" },
];

const ENERGY_SECTORS: Sector[] = [
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "OIH", name: "Oil Svc" },
];

const FULL_COMMODITIES: Commodity[] = [
  { symbol: "^VIX", name: "VIX", display: "VIX" },
  { symbol: "GC=F", name: "Gold", display: "GOLD" },
  { symbol: "CL=F", name: "Crude Oil", display: "OIL" },
  { symbol: "NG=F", name: "Natural Gas", display: "NATGAS" },
  { symbol: "SI=F", name: "Silver", display: "SILVER" },
  { symbol: "HG=F", name: "Copper", display: "COPPER" },
];

const ENERGY_COMMODITIES: Commodity[] = [
  { symbol: "CL=F", name: "Crude Oil", display: "OIL" },
  { symbol: "BZ=F", name: "Brent Crude", display: "BRENT" },
  { symbol: "NG=F", name: "Natural Gas", display: "NATGAS" },
  { symbol: "GC=F", name: "Gold", display: "GOLD" },
  { symbol: "^VIX", name: "VIX", display: "VIX" },
];

const FULL_MARKET_SYMBOLS: MarketSymbol[] = [
  { symbol: "^GSPC", name: "S&P 500", display: "SPX" },
  { symbol: "^DJI", name: "Dow Jones", display: "DOW" },
  { symbol: "^IXIC", name: "NASDAQ", display: "NDX" },
  { symbol: "AAPL", name: "Apple", display: "AAPL" },
  { symbol: "MSFT", name: "Microsoft", display: "MSFT" },
  { symbol: "NVDA", name: "NVIDIA", display: "NVDA" },
  { symbol: "GOOGL", name: "Alphabet", display: "GOOGL" },
  { symbol: "AMZN", name: "Amazon", display: "AMZN" },
  { symbol: "META", name: "Meta", display: "META" },
  { symbol: "BRK-B", name: "Berkshire", display: "BRK.B" },
  { symbol: "TSM", name: "TSMC", display: "TSM" },
  { symbol: "LLY", name: "Eli Lilly", display: "LLY" },
  { symbol: "TSLA", name: "Tesla", display: "TSLA" },
  { symbol: "AVGO", name: "Broadcom", display: "AVGO" },
  { symbol: "WMT", name: "Walmart", display: "WMT" },
  { symbol: "JPM", name: "JPMorgan", display: "JPM" },
  { symbol: "V", name: "Visa", display: "V" },
  { symbol: "UNH", name: "UnitedHealth", display: "UNH" },
  { symbol: "NVO", name: "Novo Nordisk", display: "NVO" },
  { symbol: "XOM", name: "Exxon", display: "XOM" },
  { symbol: "MA", name: "Mastercard", display: "MA" },
  { symbol: "ORCL", name: "Oracle", display: "ORCL" },
  { symbol: "PG", name: "P&G", display: "PG" },
  { symbol: "COST", name: "Costco", display: "COST" },
  { symbol: "JNJ", name: "J&J", display: "JNJ" },
  { symbol: "HD", name: "Home Depot", display: "HD" },
  { symbol: "NFLX", name: "Netflix", display: "NFLX" },
  { symbol: "BAC", name: "BofA", display: "BAC" },
];

const ENERGY_MARKET_SYMBOLS: MarketSymbol[] = [
  { symbol: "^GSPC", name: "S&P 500", display: "SPX" },
  { symbol: "^DJI", name: "Dow Jones", display: "DOW" },
  { symbol: "^IXIC", name: "NASDAQ", display: "NDX" },
  { symbol: "XOM", name: "Exxon", display: "XOM" },
  { symbol: "CVX", name: "Chevron", display: "CVX" },
  { symbol: "COP", name: "ConocoPhillips", display: "COP" },
  { symbol: "SLB", name: "Schlumberger", display: "SLB" },
  { symbol: "HAL", name: "Halliburton", display: "HAL" },
  { symbol: "EOG", name: "EOG Resources", display: "EOG" },
  { symbol: "OXY", name: "Occidental", display: "OXY" },
  { symbol: "XLE", name: "Energy ETF", display: "XLE" },
  { symbol: "OIH", name: "Oil Services ETF", display: "OIH" },
  { symbol: "BKR", name: "Baker Hughes", display: "BKR" },
];

// Variant-aware exports
export const SECTORS =
  SITE_VARIANT === "energy" ? ENERGY_SECTORS : FULL_SECTORS;
export const COMMODITIES =
  SITE_VARIANT === "energy" ? ENERGY_COMMODITIES : FULL_COMMODITIES;
export const MARKET_SYMBOLS =
  SITE_VARIANT === "energy" ? ENERGY_MARKET_SYMBOLS : FULL_MARKET_SYMBOLS;
