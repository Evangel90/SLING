export type SavedGift = {
  wallet: string;
  recoverUrl: string;
  claimUrl: string;
  symbol: string;
  name?: string;
  usd: number;
  tokens: number;
  message?: string;
  /** ms; set for time-locked gifts */
  unlockAt?: number;
  createdAt: number;
  signature?: string;
};

const KEY = "prestock-gifts:v1";

export function loadSavedGifts(): SavedGift[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedGift[];
  } catch {
    return [];
  }
}

export function saveGift(g: Omit<SavedGift, "createdAt">): boolean {
  try {
    const all = loadSavedGifts();
    const prev = all.find((x) => x.wallet === g.wallet);
    const rest = all.filter((x) => x.wallet !== g.wallet);
    localStorage.setItem(KEY, JSON.stringify([{ ...g, createdAt: prev?.createdAt ?? Date.now() }, ...rest]));
    return true;
  } catch {
    // Storage can be unavailable (private mode); the on-screen recovery link is still the source of truth.
    return false;
  }
}
