/**
 * Dry-runs the real create and claim transactions against mainnet with simulateTransaction,
 * using an existing PreStocks holder as the sender. No keys, no funds, nothing is sent.
 *
 *   npx tsx scripts/simulate.ts [SYMBOL]
 */
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { buildCreateTx, buildSweepTx } from "../src/lib/gift";
import { loadMintInfo, netAfterTwoHops, rawToUi } from "../src/lib/mint";
import { fetchPreStocks } from "../src/lib/prestocks";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

async function main() {
  const symbol = (process.argv[2] ?? "OPENAI").toUpperCase();
  const connection = new Connection(RPC, "confirmed");
  const stock = (await fetchPreStocks()).find((s) => s.symbol === symbol);
  if (!stock) throw new Error(`Unknown or excluded PreStock ${symbol}`);
  const mint = new PublicKey(stock.mint);
  const info = await loadMintInfo(connection, mint);
  console.log(`${symbol}: decimals=${info.decimals} multiplier=${info.multiplier} fee=${info.feeBps}bps epoch=${info.epoch}`);

  // Find a recent holder (from recent mint activity) whose wallet has SOL to pay fees.
  let sender: PublicKey | null = null;
  let holderAta: PublicKey | null = null;
  let holderRaw = 0n;
  const sigs = await connection.getSignaturesForAddress(mint, { limit: 15 });
  outer: for (const s of sigs) {
    const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 1 }).catch(() => null);
    for (const b of tx?.meta?.postTokenBalances ?? []) {
      if (b.mint !== stock.mint || !b.owner || BigInt(b.uiTokenAmount.amount) === 0n) continue;
      const owner = new PublicKey(b.owner);
      if (!PublicKey.isOnCurve(owner.toBytes())) continue;
      const ata = tx!.transaction.message.accountKeys[b.accountIndex].pubkey;
      const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
      if (!bal || BigInt(bal.value.amount) === 0n) continue;
      if ((await connection.getBalance(owner)) < 5_000_000) continue;
      sender = owner;
      holderAta = ata;
      holderRaw = BigInt(bal.value.amount);
      break outer;
    }
  }
  if (!sender || !holderAta) throw new Error("No suitable holder found");

  const usd = 10;
  const wanted = BigInt(Math.floor((usd / stock.tokenPrice / info.multiplier) * 10 ** info.decimals));
  const raw = wanted < holderRaw ? wanted : holderRaw / 2n;
  console.log(`Sender ${sender.toBase58()} holds ${rawToUi(info, holderRaw).toFixed(4)} ${symbol}`);
  console.log(`$${usd} → raw ${raw} (${rawToUi(info, raw).toFixed(6)} ${symbol}); claimer nets ${rawToUi(info, netAfterTwoHops(info, raw)).toFixed(6)}`);

  const gift = Keypair.generate();
  const createTx = await buildCreateTx({ connection, sender, gift: gift.publicKey, mint, decimals: info.decimals, raw });
  const sim1 = await connection.simulateTransaction(createTx.compileMessage() as never, undefined as never);
  report("CREATE", sim1.value);

  // Sweep: treat the holder's token account as the gift wallet and move its whole balance to a fresh
  // claimer, then harvest withheld fees and close it (the rent-recovery path).
  const claimer = Keypair.generate().publicKey;
  const sweepTx = await buildSweepTx({
    connection,
    gift: sender,
    giftTokenAccount: holderAta,
    mint,
    decimals: info.decimals,
    raw: holderRaw,
    destination: claimer,
    feePayer: sender,
  });
  const sim2 = await connection.simulateTransaction(sweepTx.compileMessage() as never, undefined as never);
  report("CLAIM + harvest + close", sim2.value);
  const closed = (sim2.value.logs ?? []).some((l) => /CloseAccount/i.test(l));
  console.log(`gift token account closed in simulation: ${closed}`);
}

function report(label: string, v: { err: unknown; logs: string[] | null; unitsConsumed?: number }) {
  console.log(`\n${label}: ${v.err ? `FAILED ${JSON.stringify(v.err)}` : "OK"} (${v.unitsConsumed} CU)`);
  if (v.err) console.log((v.logs ?? []).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
