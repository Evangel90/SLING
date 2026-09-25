import { Connection, PublicKey } from "@solana/web3.js";
import { feeOn, loadMintInfo, rawToUi, type MintInfo } from "./mint";
import { readGift, type GiftState } from "./gift";
import type { PreStock } from "./prestocks";

export type GiftView = {
  state: GiftState;
  stock: PreStock | null;
  mintInfo: MintInfo | null;
  /** Display units in the gift wallet (for an opened gift: what it held when it was opened). */
  ui: number;
  usd: number;
  /** Display units the claimer receives after the claim-hop transfer fee. */
  netUi: number;
  netUsd: number;
};

export async function loadGiftView(
  connection: Connection,
  wallet: PublicKey,
  stocks: PreStock[],
): Promise<GiftView> {
  const state = await readGift(connection, wallet, new Set(stocks.map((s) => s.mint)));
  const mint = state.kind === "funded" ? state.mint : state.kind === "empty" ? state.mint : null;
  if (!mint) {
    return { state, stock: null, mintInfo: null, ui: 0, usd: 0, netUi: 0, netUsd: 0 };
  }
  const stock = stocks.find((s) => s.mint === mint.toBase58()) ?? null;
  const mintInfo = await loadMintInfo(connection, mint);
  const raw = state.kind === "funded" ? state.raw : state.kind === "empty" ? state.lastRaw : 0n;
  const ui = rawToUi(mintInfo, raw);
  const netUi = rawToUi(mintInfo, raw - feeOn(mintInfo, raw));
  const price = stock?.tokenPrice ?? 0;
  return { state, stock, mintInfo, ui, usd: ui * price, netUi, netUsd: netUi * price };
}
