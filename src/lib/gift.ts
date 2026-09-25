import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createHarvestWithheldTokensToMintInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";

export const MESSAGE_MAX = 140;
export const FROM_MAX = 32;

const CU_LIMIT = 120_000;
const CU_PRICE_MICROLAMPORTS = 50_000;

// ---------- keys and links ----------

/** Gift keys travel as the 32-byte ed25519 seed (44 base58 chars) to keep links short. */
export function newGiftKey(): { keypair: Keypair; seed: string } {
  const keypair = Keypair.generate();
  return { keypair, seed: bs58.encode(keypair.secretKey.slice(0, 32)) };
}

export function keypairFromSeed(seed: string): Keypair {
  const bytes = bs58.decode(seed);
  if (bytes.length !== 32) throw new Error("Malformed gift key");
  return Keypair.fromSeed(bytes);
}

/** Rebuild the gift key and make sure it actually controls the wallet named in the link. */
export function giftKeyFor(wallet: string, seed: string | null | undefined): Keypair | null {
  if (!seed) return null;
  try {
    const kp = keypairFromSeed(seed);
    return kp.publicKey.toBase58() === wallet ? kp : null;
  } catch {
    return null;
  }
}

export type LinkExtras = { message?: string; from?: string };

/** A claim link either carries the gift key, or (locked gifts) the key time-lock encrypted to a drand round. */
export type ClaimSecret = { kind: "key"; seed: string } | { kind: "locked"; ciphertext: string; unlockAt: number };

function withExtras(p: URLSearchParams, extras: LinkExtras) {
  if (extras.message) p.set("m", extras.message.slice(0, MESSAGE_MAX));
  if (extras.from) p.set("f", extras.from.slice(0, FROM_MAX));
  return p;
}

const unix = (ms: number) => String(Math.floor(ms / 1000));

/** Web claim link: secrets live in the fragment, which browsers never send to a server. */
export function claimUrl(origin: string, wallet: string, secret: ClaimSecret, extras: LinkExtras) {
  if (secret.kind === "key") {
    return `${origin}/claim/${wallet}#${withExtras(new URLSearchParams({ k: secret.seed }), extras)}`;
  }
  const frag = withExtras(new URLSearchParams({ c: secret.ciphertext }), extras);
  return `${origin}/claim/${wallet}?u=${unix(secret.unlockAt)}#${frag}`;
}

/** Blink link: the Actions server must sign, so the secret has to be in the query string. */
export function blinkUrl(origin: string, wallet: string, secret: ClaimSecret, extras: LinkExtras) {
  const p = new URLSearchParams({ w: wallet });
  if (secret.kind === "key") p.set("k", secret.seed);
  else {
    p.set("u", unix(secret.unlockAt));
    p.set("c", secret.ciphertext);
  }
  return `${origin}/api/actions/claim?${withExtras(p, extras)}`;
}

export function dialToUrl(actionUrl: string) {
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl}`)}`;
}

/**
 * Always carries the plaintext key, so the sender can cancel even a locked gift. Also carries the
 * message and unlock time so the recovery page can show the card and rebuild the claim link.
 */
export function recoverUrl(origin: string, wallet: string, seed: string, extras: LinkExtras, unlockAt?: number) {
  const p = withExtras(new URLSearchParams({ k: seed }), extras);
  if (unlockAt) p.set("u", unix(unlockAt));
  return `${origin}/recover/${wallet}#${p}`;
}

export function readFragment(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

// ---------- on-chain state ----------

export type GiftState =
  | { kind: "funded"; mint: PublicKey; tokenAccount: PublicKey; raw: bigint; decimals: number }
  /** Claimed or taken back. The gift's token account is usually closed, so mint and amount come from history. */
  | { kind: "empty"; mint: PublicKey | null; decimals: number; lastRaw: bigint }
  | { kind: "missing" };

/**
 * A gift's whole state is on-chain: a funded token account means it's waiting; no token account but
 * some history means it was claimed or taken back; no history at all means it was never funded.
 */
export async function readGift(
  connection: Connection,
  wallet: PublicKey,
  allowedMints?: Set<string>,
): Promise<GiftState> {
  const res = await connection.getParsedTokenAccountsByOwner(
    wallet,
    { programId: TOKEN_2022_PROGRAM_ID },
    "confirmed",
  );
  const accounts = res.value
    .map((a) => {
      const info = a.account.data.parsed.info as {
        mint: string;
        tokenAmount: { amount: string; decimals: number };
      };
      return {
        pubkey: a.pubkey,
        mint: info.mint,
        raw: BigInt(info.tokenAmount.amount),
        decimals: info.tokenAmount.decimals,
      };
    })
    .filter((a) => !allowedMints || allowedMints.has(a.mint))
    .sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : 0));

  const top = accounts[0];
  if (top && top.raw > 0n) {
    return { kind: "funded", mint: new PublicKey(top.mint), tokenAccount: top.pubkey, raw: top.raw, decimals: top.decimals };
  }
  return readGiftHistory(connection, wallet, allowedMints);
}

async function readGiftHistory(connection: Connection, wallet: PublicKey, allowedMints?: Set<string>): Promise<GiftState> {
  const sigs = await connection.getSignaturesForAddress(wallet, { limit: 10 }, "confirmed");
  if (sigs.length === 0) return { kind: "missing" };
  const owner = wallet.toBase58();
  // Newest first: the sweep's pre-balance is what the gift held when it was opened.
  for (const s of sigs) {
    const tx = await connection
      .getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 1, commitment: "confirmed" })
      .catch(() => null);
    const pre = tx?.meta?.preTokenBalances?.find((b) => b.owner === owner && (!allowedMints || allowedMints.has(b.mint)));
    const post = tx?.meta?.postTokenBalances?.find((b) => b.owner === owner && (!allowedMints || allowedMints.has(b.mint)));
    const bal = pre && BigInt(pre.uiTokenAmount.amount) > 0n ? pre : post;
    if (bal) {
      return {
        kind: "empty",
        mint: new PublicKey(bal.mint),
        decimals: bal.uiTokenAmount.decimals,
        lastRaw: BigInt(bal.uiTokenAmount.amount),
      };
    }
  }
  return { kind: "empty", mint: null, decimals: 0, lastRaw: 0n };
}

// ---------- transactions ----------

function budget() {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICROLAMPORTS }),
  ];
}

/** Sender pays the gift wallet's token-account rent and deposits the PreStock in one signature. */
export async function buildCreateTx(args: {
  connection: Connection;
  sender: PublicKey;
  gift: PublicKey;
  mint: PublicKey;
  decimals: number;
  raw: bigint;
}): Promise<Transaction> {
  const { connection, sender, gift, mint, decimals, raw } = args;
  const senderAta = getAssociatedTokenAddressSync(mint, sender, false, TOKEN_2022_PROGRAM_ID);
  const giftAta = getAssociatedTokenAddressSync(mint, gift, false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction().add(
    ...budget(),
    createAssociatedTokenAccountIdempotentInstruction(sender, giftAta, gift, mint, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(senderAta, mint, giftAta, sender, raw, decimals, [], TOKEN_2022_PROGRAM_ID),
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = sender;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  return tx;
}

/**
 * Moves the gift wallet's entire balance to `destination`. Used for both claim and take-back.
 * `feePayer` pays network fees and any new token-account rent; the gift wallet never needs SOL.
 * The caller must partially sign with the gift key.
 */
export async function buildSweepTx(args: {
  connection: Connection;
  gift: PublicKey;
  giftTokenAccount: PublicKey;
  mint: PublicKey;
  decimals: number;
  raw: bigint;
  destination: PublicKey;
  feePayer: PublicKey;
}): Promise<Transaction> {
  const { connection, gift, giftTokenAccount, mint, decimals, raw, destination, feePayer } = args;
  const destAta = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction().add(
    ...budget(),
    createAssociatedTokenAccountIdempotentInstruction(feePayer, destAta, destination, mint, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(giftTokenAccount, mint, destAta, gift, raw, decimals, [], TOKEN_2022_PROGRAM_ID),
    // A Token-2022 account can't close while it holds withheld transfer fees; harvesting them to
    // the mint is permissionless, after which the emptied gift account closes and its rent goes
    // to whoever opened the gift.
    createHarvestWithheldTokensToMintInstruction(mint, [giftTokenAccount], TOKEN_2022_PROGRAM_ID),
    createCloseAccountInstruction(giftTokenAccount, destination, gift, [], TOKEN_2022_PROGRAM_ID),
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = feePayer;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  return tx;
}

/** Polls instead of subscribing, so it works through the HTTP-only RPC proxy. */
export async function confirmSignature(
  connection: Connection,
  signature: TransactionSignature,
  lastValidBlockHeight: number,
): Promise<void> {
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) throw new Error("Transaction expired before it was confirmed.");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
