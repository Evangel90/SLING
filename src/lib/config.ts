export const PRESTOCKS_API = "https://prestocks.com/api/prestocks";

// A PreStock must be converted by its deadline (after an IPO) or it expires worthless.
// SPACEX: listed on Nasdaq 12 Jun 2026, conversion deadline 12 Mar 2027.
const KNOWN_DEADLINES: Record<string, string> = { SPACEX: "2027-03-12" };

/** Extra deadlines as JSON, e.g. {"ANTHROPIC":"2026-12-15"}, for announcements before a redeploy (or demos). */
function extraDeadlines(): Record<string, string> {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_CONVERSION_DEADLINES ?? "{}");
  } catch {
    return {};
  }
}

export const CONVERSION_DEADLINES: Record<string, string> = { ...KNOWN_DEADLINES, ...extraDeadlines() };

// Excluded outright: a near deadline makes a gift too likely to expire before it's claimed.
export const EXCLUDED_SYMBOLS = new Set(["SPACEX"]);

/** Latest unlock time that still leaves the recipient a week to claim before conversion closes. */
export const DEADLINE_BUFFER_DAYS = 7;

export const SERVER_RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export function appUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

export function explorerTx(sig: string) {
  return `https://solscan.io/tx/${sig}`;
}

export function explorerAccount(addr: string) {
  return `https://solscan.io/account/${addr}`;
}
