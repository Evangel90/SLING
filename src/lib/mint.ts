import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  calculateEpochFee,
  getEpochFee,
  getMint,
  getScaledUiAmountConfig,
  getTransferFeeConfig,
  getTransferHook,
  type TransferFeeConfig,
} from "@solana/spl-token";

export type MintInfo = {
  mint: PublicKey;
  decimals: number;
  multiplier: number;
  feeBps: number;
  feeConfig: TransferFeeConfig | null;
  epoch: bigint;
};

export async function loadMintInfo(connection: Connection, mint: PublicKey): Promise<MintInfo> {
  const [m, epochInfo] = await Promise.all([
    getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID),
    connection.getEpochInfo("confirmed"),
  ]);

  const hook = getTransferHook(m);
  if (hook && !hook.programId.equals(PublicKey.default)) {
    throw new Error("This PreStock has an active transfer hook, which gift links don't support yet.");
  }

  const scaled = getScaledUiAmountConfig(m);
  let multiplier = 1;
  if (scaled) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    multiplier =
      scaled.newMultiplierEffectiveTimestamp > 0n && now >= scaled.newMultiplierEffectiveTimestamp
        ? scaled.newMultiplier
        : scaled.multiplier;
  }

  const feeConfig = getTransferFeeConfig(m);
  const epoch = BigInt(epochInfo.epoch);
  const feeBps = feeConfig ? getEpochFee(feeConfig, epoch).transferFeeBasisPoints : 0;

  return { mint, decimals: m.decimals, multiplier, feeBps, feeConfig, epoch };
}

export function feeOn(info: MintInfo, raw: bigint): bigint {
  return info.feeConfig ? calculateEpochFee(info.feeConfig, info.epoch, raw) : 0n;
}

/** Raw base units → what wallets display (applies the ScaledUiAmount multiplier). */
export function rawToUi(info: Pick<MintInfo, "decimals" | "multiplier">, raw: bigint): number {
  return (Number(raw) / 10 ** info.decimals) * info.multiplier;
}

export function uiToRaw(info: Pick<MintInfo, "decimals" | "multiplier">, ui: number): bigint {
  if (!Number.isFinite(ui) || ui <= 0) return 0n;
  return BigInt(Math.floor((ui / info.multiplier) * 10 ** info.decimals));
}

/** What the claimer ends up with after the deposit hop and the claim hop are both charged. */
export function netAfterTwoHops(info: MintInfo, raw: bigint): bigint {
  const inGift = raw - feeOn(info, raw);
  return inGift - feeOn(info, inGift);
}

export function formatTokens(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
