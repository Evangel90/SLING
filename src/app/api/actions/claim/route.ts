import {
  createActionHeaders,
  createPostResponse,
  type ActionGetResponse,
  type ActionPostRequest,
} from "@solana/actions";
import { Connection, PublicKey, type Keypair } from "@solana/web3.js";
import { SERVER_RPC_URL } from "@/lib/config";
import { buildSweepTx, giftKeyFor, FROM_MAX, MESSAGE_MAX } from "@/lib/gift";
import { loadGiftView } from "@/lib/giftView";
import { formatTokens, formatUsd } from "@/lib/mint";
import { fetchPreStocks } from "@/lib/prestocks";
import { unlockSeed } from "@/lib/timelock";
import { fmtDay, fmtLong, fmtShort } from "@/lib/dates";
import { shareImageUrl, type ShareState } from "@/lib/share";

// This route receives gift keys (or time-locked ciphertext) in the query string.
// Never log request URLs or params here.

const headers = createActionHeaders({ chainId: "mainnet" });

function fail(message: string, status = 400) {
  return Response.json({ message }, { status, headers });
}

function parse(req: Request) {
  const q = new URL(req.url).searchParams;
  const wallet = q.get("w") ?? "";
  const u = Number(q.get("u"));
  return {
    wallet,
    seed: q.get("k"),
    ciphertext: q.get("c"),
    unlockAt: Number.isFinite(u) && u > 0 ? u * 1000 : null,
    message: (q.get("m") ?? "").slice(0, MESSAGE_MAX),
    from: (q.get("f") ?? "").slice(0, FROM_MAX),
  };
}

/** The gift key, or why there isn't one yet. Locked links only yield a key once drand publishes the round. */
async function resolveKey(p: ReturnType<typeof parse>): Promise<{ key: Keypair } | { early: true } | { error: string }> {
  if (p.seed) {
    const key = giftKeyFor(p.wallet, p.seed);
    return key ? { key } : { error: "This gift link is incomplete or damaged." };
  }
  if (!p.ciphertext) return { error: "This gift link is incomplete or damaged." };
  if (p.unlockAt && Date.now() < p.unlockAt) return { early: true };
  const r = await unlockSeed(p.ciphertext);
  if (r.kind === "early") return { early: true };
  if (r.kind === "error") return { error: r.message };
  const key = giftKeyFor(p.wallet, r.seed);
  return key ? { key } : { error: "This gift link doesn't match its gift wallet." };
}

export async function GET(req: Request) {
  const p = parse(req);
  const { wallet, message, from, unlockAt } = p;
  let walletKey: PublicKey;
  try {
    walletKey = new PublicKey(wallet);
  } catch {
    return fail("This gift link is incomplete or damaged.");
  }

  const origin = new URL(req.url).origin;
  try {
    const connection = new Connection(SERVER_RPC_URL, "confirmed");
    const [stocks, resolved] = await Promise.all([fetchPreStocks(), resolveKey(p)]);
    if ("error" in resolved) return fail(resolved.error);

    const view = await loadGiftView(connection, walletKey, stocks);
    const sender = from || "Someone";
    const name = view.stock?.name ?? "a PreStock";
    const symbol = view.stock?.symbol ?? "";
    const shareImage = (st: ShareState) => shareImageUrl(origin, view, st, { message, from, unlockAt });

    if (view.state.kind === "missing") {
      const res: ActionGetResponse = {
        icon: `${origin}/icon.svg`,
        title: "Gift not found",
        description: "This gift was never funded. Ask the sender for a new link.",
        label: "Unavailable",
        disabled: true,
      };
      return Response.json(res, { headers });
    }

    if (view.state.kind === "empty") {
      const res: ActionGetResponse = {
        icon: shareImage("gone"),
        title: "This gift has already been claimed or taken back by the sender.",
        description: `Each gift can only be used once. If you were expecting it, check with ${from || "the sender"}.`,
        label: "Claimed or taken back",
        disabled: true,
      };
      return Response.json(res, { headers });
    }

    const deadline = view.stock?.deadline ? new Date(`${view.stock.deadline}T09:00`) : null;
    const about = [
      message ? `“${message}” — ${sender}` : null,
      deadline ? `Claim before ${fmtDay(deadline)}. After that this token can no longer be converted.` : null,
      `A piece of ${name} before it goes public. You receive ≈ ${formatUsd(view.netUsd)} (${formatTokens(view.netUi)} ${symbol}) after the token's transfer fee.`,
    ];
    const legal =
      "PreStocks track a private company's value and give no ownership, voting or dividend rights. Not available in every country, including to U.S. persons.";

    if ("early" in resolved) {
      const opens = unlockAt ? fmtLong(new Date(unlockAt)) : "its unlock time";
      const res: ActionGetResponse = {
        icon: shareImage("locked"),
        title: `You've received ${formatUsd(view.usd)} of ${name}`,
        description: [...about, `This gift opens on ${opens}. Locked gifts can't be opened early by anyone, including us.`, legal]
          .filter(Boolean)
          .join("\n\n"),
        label: unlockAt ? `Opens ${fmtShort(new Date(unlockAt))}` : "Locked",
        disabled: true,
      };
      return Response.json(res, { headers });
    }

    const res: ActionGetResponse = {
      icon: shareImage("claimable"),
      title: `You've received ${formatUsd(view.usd)} of ${name}`,
      description: [...about, legal].filter(Boolean).join("\n\n"),
      label: "Claim gift",
    };
    return Response.json(res, { headers });
  } catch {
    return fail("Couldn't load this gift. Try again in a moment.", 500);
  }
}

export async function POST(req: Request) {
  const p = parse(req);

  let account: PublicKey;
  try {
    const body = (await req.json()) as ActionPostRequest;
    account = new PublicKey(body.account);
  } catch {
    return fail("Invalid account.");
  }

  try {
    const resolved = await resolveKey(p);
    if ("error" in resolved) return fail(resolved.error);
    if ("early" in resolved) {
      return fail(p.unlockAt ? `This gift opens on ${fmtLong(new Date(p.unlockAt))}.` : "This gift is still locked.");
    }
    const { key } = resolved;

    const connection = new Connection(SERVER_RPC_URL, "confirmed");
    const stocks = await fetchPreStocks();
    const view = await loadGiftView(connection, key.publicKey, stocks);
    if (view.state.kind !== "funded") return fail("This gift has already been claimed or taken back.");

    const tx = await buildSweepTx({
      connection,
      gift: key.publicKey,
      giftTokenAccount: view.state.tokenAccount,
      mint: view.state.mint,
      decimals: view.state.decimals,
      raw: view.state.raw,
      destination: account,
      feePayer: account,
    });

    const payload = await createPostResponse({
      fields: {
        type: "transaction",
        transaction: tx,
        message: `Claimed ${formatTokens(view.netUi)} ${view.stock?.symbol ?? ""}. Welcome to the pre-IPO club.`,
      },
      signers: [key],
    });
    return Response.json(payload, { headers });
  } catch {
    return fail("Couldn't build the claim transaction. Try again in a moment.", 500);
  }
}

export function OPTIONS() {
  return new Response(null, { headers });
}
