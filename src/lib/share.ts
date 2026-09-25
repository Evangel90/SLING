import { Connection, PublicKey } from "@solana/web3.js";
import { SERVER_RPC_URL } from "./config";
import { fmtShort } from "./dates";
import { loadGiftView, type GiftView } from "./giftView";
import { formatUsd } from "./mint";
import { fetchPreStocks } from "./prestocks";

export type ShareState = "claimable" | "locked" | "gone";

/** 1:1 share image for a gift. Only public details go in the URL, never the key. */
export function shareImageUrl(
  origin: string,
  view: GiftView,
  st: ShareState,
  extras: { message?: string; from?: string; unlockAt?: number | null },
  layout: "square" | "wide" = "square",
) {
  if (!view.stock) return `${origin}/icon.svg`;
  const q = new URLSearchParams({
    s: view.stock.symbol,
    n: view.stock.name,
    st,
    usd: view.usd.toFixed(2),
    t: view.ui.toFixed(4),
  });
  if (st === "locked" && extras.unlockAt) q.set("d", fmtShort(new Date(extras.unlockAt)));
  if (extras.message) q.set("m", extras.message);
  if (extras.from) q.set("f", extras.from);
  if (layout === "wide") q.set("layout", "wide");
  return `${origin}/api/actions/image?${q}`;
}

/** Title, description and image for a gift link preview (X cards, iMessage, Slack…). */
export async function giftPreview(
  origin: string,
  wallet: string,
  extras: { message?: string; from?: string; unlockAt?: number | null },
) {
  const stocks = await fetchPreStocks();
  const view = await loadGiftView(new Connection(SERVER_RPC_URL, "confirmed"), new PublicKey(wallet), stocks);
  const name = view.stock?.name ?? "a PreStock";
  if (view.state.kind === "missing") {
    return {
      view,
      st: "claimable" as ShareState,
      title: "A gift for you",
      description: "Someone sent you a piece of a company before it goes public. Claim it on Solana in one tap.",
      // X can't render SVG previews, so an unknown gift gets a text-only card.
      image: null as string | null,
    };
  }
  const st: ShareState =
    view.state.kind !== "funded" ? "gone" : extras.unlockAt && Date.now() < extras.unlockAt ? "locked" : "claimable";
  const title =
    st === "gone"
      ? "This gift has already been claimed or taken back"
      : `${extras.from ? `${extras.from} sent you` : "You've received"} ${formatUsd(view.usd)} of ${name}`;
  const description =
    st === "locked" && extras.unlockAt
      ? `A piece of ${name} before it goes public. It opens ${fmtShort(new Date(extras.unlockAt))}.`
      : st === "gone"
        ? "Each SLING gift can only be opened once."
        : `A piece of ${name} before it goes public. Claim it to your Solana wallet in one tap.`;
  return { view, st, title, description, image: shareImageUrl(origin, view, st, extras, "wide") as string | null };
}
