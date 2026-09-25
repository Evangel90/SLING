import { CONVERSION_DEADLINES, EXCLUDED_SYMBOLS, PRESTOCKS_API } from "./config";

export type PreStock = {
  symbol: string;
  name: string;
  mint: string;
  logo: string;
  tokenPrice: number;
  url: string;
  /** ISO date by which this PreStock must be converted, if one has been announced. */
  deadline?: string;
};

type ApiAsset = {
  name: string;
  symbol: string;
  image: string;
  external_url: string;
  contract_address: string;
  tokenPrice: number;
};

export type Brand = { mono: string; tile: string; card: string; tint: string };

const BRANDS: Record<string, Brand> = {
  ANDURIL: { mono: "AD", tile: "#3D4A3A", card: "#161B15", tint: "#A7B89A" },
  ANTHROPIC: { mono: "AN", tile: "#8A4B2F", card: "#20160F", tint: "#D9A27F" },
  FIGUREAI: { mono: "FG", tile: "#3B3F8C", card: "#16172A", tint: "#A3A8F0" },
  KALSHI: { mono: "KL", tile: "#1F6B63", card: "#0F1D1C", tint: "#7FC9BE" },
  NEURALINK: { mono: "NL", tile: "#5B3A6E", card: "#1B1320", tint: "#C3A0D6" },
  OPENAI: { mono: "OA", tile: "#3A3A3D", card: "#18181A", tint: "#C8C8CC" },
  POLYMARKET: { mono: "PM", tile: "#2F5AA8", card: "#111A2B", tint: "#8DB0EE" },
  SPACEX: { mono: "SX", tile: "#26324A", card: "#151A24", tint: "#8FA3C7" },
};

const DEFAULT_BRAND: Brand = { mono: "PS", tile: "#3A3A3D", card: "#18181A", tint: "#C8C8CC" };

export function brandFor(symbol: string): Brand {
  return BRANDS[symbol] ?? { ...DEFAULT_BRAND, mono: symbol.slice(0, 2) };
}

// Lead the picker with the names that pitch best.
const ORDER = ["OPENAI", "ANTHROPIC", "ANDURIL", "NEURALINK", "FIGUREAI", "KALSHI", "POLYMARKET"];

export async function fetchPreStocks(): Promise<PreStock[]> {
  const res = await fetch(PRESTOCKS_API, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`PreStocks API ${res.status}`);
  const data = (await res.json()) as ApiAsset[];
  return data
    .filter((a) => !EXCLUDED_SYMBOLS.has(a.symbol))
    .map((a) => ({
      symbol: a.symbol,
      name: a.name.replace(/\s*PreStocks$/i, ""),
      mint: a.contract_address,
      logo: a.image,
      tokenPrice: a.tokenPrice,
      url: a.external_url,
      deadline: CONVERSION_DEADLINES[a.symbol],
    }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.symbol);
      const ib = ORDER.indexOf(b.symbol);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
}
