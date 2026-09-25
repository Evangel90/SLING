"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { StockTile, ICON } from "./GiftCard";
import { KeyIcon } from "./GiftCreated";
import { useToast } from "./ui";
import { loadSavedGifts, type SavedGift } from "@/lib/localGifts";
import { readGift } from "@/lib/gift";
import { formatTokens, formatUsd } from "@/lib/mint";
import { fmtShort } from "@/lib/dates";

type Live = "waiting" | "locked" | "gone" | "unknown";

const STATUS: Record<Live, { label: string; cls: string; icon: string }> = {
  waiting: { label: "Waiting to be claimed", cls: "text-green bg-green-bg", icon: ICON.gift },
  locked: { label: "Locked", cls: "text-amber bg-amber-bg", icon: ICON.lock },
  gone: { label: "Claimed or taken back", cls: "text-ink-2 bg-surface-2", icon: ICON.done },
  unknown: { label: "Checking…", cls: "text-muted bg-surface-2", icon: ICON.done },
};

// Cached snapshot so useSyncExternalStore gets a stable reference.
let cache: { raw: string | null; gifts: SavedGift[] } = { raw: null, gifts: [] };
function snapshot(): SavedGift[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("prestock-gifts:v1");
  } catch {}
  if (raw !== cache.raw) cache = { raw, gifts: loadSavedGifts() };
  return cache.gifts;
}
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export function GiftsSent() {
  const { connection } = useConnection();
  const gifts = useSyncExternalStore(subscribe, snapshot, () => null);
  const [live, setLive] = useState<Record<string, Live>>({});
  const toast = useToast();

  useEffect(() => {
    if (!gifts?.length) return;
    let alive = true;
    for (const g of gifts) {
      readGift(connection, new PublicKey(g.wallet))
        .then((s) => {
          if (!alive) return;
          const st: Live = s.kind !== "funded" ? "gone" : g.unlockAt && Date.now() < g.unlockAt ? "locked" : "waiting";
          setLive((m) => ({ ...m, [g.wallet]: st }));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [connection, gifts]);

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(() => toast.show("Claim link copied"));
  }

  if (gifts === null) {
    return <main className="w-full max-w-[1120px] mx-auto px-4 pt-10" aria-busy="true" />;
  }

  if (gifts.length === 0) {
    return (
      <main className="w-full max-w-[1120px] mx-auto px-4 sm:px-8 pt-8 sm:pt-10 pb-16 flex flex-col gap-10">
        <h1 className="m-0 text-[28px] sm:text-4xl font-semibold tracking-[-0.03em]">Gifts sent</h1>
        <div className="flex flex-col items-center gap-7 pt-6 text-center">
          <div aria-hidden="true" className="relative w-[300px] h-[190px]">
            <div className="absolute left-6 top-0 w-[276px] h-[172px] rounded-[20px] bg-line rotate-[4deg]" />
            <div className="absolute left-0 top-3.5 w-[276px] h-[172px] rounded-[20px] border-[1.5px] border-dashed border-faint bg-field flex items-center justify-center -rotate-2">
              <span className="size-[52px] rounded-full bg-surface border border-line flex items-center justify-center text-accent">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 max-w-[340px]">
            <h2 className="m-0 text-2xl font-semibold tracking-[-0.02em]">No gifts on this device yet.</h2>
            <p className="m-0 text-[15px] leading-normal text-muted">
              Send someone a piece of the future. Only gifts created on this device appear here. Sent one elsewhere? Open its recovery
              link.
            </p>
          </div>
          <Link href="/" className="h-[52px] w-full max-w-[340px] rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-base font-semibold flex items-center justify-center">
            Create your first gift
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="w-full max-w-[1120px] mx-auto px-4 sm:px-8 pt-8 sm:pt-10 pb-16 flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <h1 className="m-0 text-[28px] sm:text-4xl font-semibold tracking-[-0.03em]">Gifts sent</h1>
        <Link href="/" className="h-12 px-5 rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-[15px] font-semibold flex items-center gap-2">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New gift
        </Link>
      </div>
      <div role="note" className="flex items-center gap-2.5 px-4 py-3 rounded-[14px] bg-surface-2 text-sm text-ink-2">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-ink">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <span>
          <strong className="font-semibold text-ink">Only gifts created on this device appear here.</strong> Your recovery links work from
          anywhere.
        </span>
      </div>

      <div role="table" aria-label="Gifts sent" className="bg-surface border border-line rounded-[20px] overflow-hidden">
        <div role="row" className="hidden md:grid h-11 px-5 grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,0.7fr)_300px] gap-4 items-center border-b border-line bg-field text-xs font-semibold tracking-[0.04em] uppercase text-muted">
          <span role="columnheader">Gift</span>
          <span role="columnheader">Amount</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Created</span>
          <span role="columnheader" className="text-right">
            Actions
          </span>
        </div>
        {gifts.map((g) => {
          const liveSt = live[g.wallet] ?? "unknown";
          const st = {
            ...STATUS[liveSt],
            label: liveSt === "locked" && g.unlockAt ? `Locked until ${fmtShort(new Date(g.unlockAt))}` : STATUS[liveSt].label,
          };
          const active = live[g.wallet] !== "gone";
          const name = g.name ?? brandName(g.symbol);
          return (
            <div
              role="row"
              key={g.wallet}
              className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,0.7fr)_300px] gap-x-4 gap-y-3 items-center px-4 md:px-5 py-4 md:py-0 md:h-[76px] border-b border-line-soft last:border-b-0 hover:bg-field"
            >
              <div role="cell" className="flex items-center gap-3 min-w-0">
                <StockTile symbol={g.symbol} size={38} />
                <span className="flex flex-col min-w-0">
                  <span className="text-[15px] font-semibold">{name}</span>
                  <span className="font-serif italic text-[15px] text-muted truncate">{g.message || "No message"}</span>
                </span>
              </div>
              <div role="cell" className="flex flex-col text-right md:text-left">
                <span className="text-[15px] font-semibold">{formatUsd(g.usd)}</span>
                <span className="font-mono text-xs text-muted">
                  {formatTokens(g.tokens ?? 0)} {g.symbol}
                </span>
              </div>
              <div role="cell">
                <span className={`h-7 px-2.5 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${st.cls}`}>
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d={st.icon} />
                  </svg>
                  {st.label}
                </span>
              </div>
              <div role="cell" className="text-sm text-ink-2 text-right md:text-left">
                {new Date(g.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
              <div role="cell" className="col-span-2 md:col-span-1 flex md:justify-end gap-2">
                {active && (
                  <button
                    type="button"
                    onClick={() => copy(g.claimUrl)}
                    className="h-10 px-3 rounded-[10px] border border-line bg-surface hover:bg-surface-2 text-[13px] font-semibold flex items-center gap-1.5"
                  >
                    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="8" y="8" width="11" height="11" rx="2.5" />
                      <path d="M5 15.5V6.5A1.5 1.5 0 0 1 6.5 5h9" />
                    </svg>
                    Copy claim link
                  </button>
                )}
                <a
                  href={g.recoverUrl}
                  className="h-10 px-3 rounded-[10px] border border-line bg-surface hover:bg-surface-2 text-[13px] font-semibold flex items-center gap-1.5"
                >
                  <KeyIcon size={15} />
                  Recovery page
                </a>
              </div>
            </div>
          );
        })}
      </div>
      {toast.node}
    </main>
  );
}

function brandName(symbol: string) {
  const names: Record<string, string> = { FIGUREAI: "Figure AI", OPENAI: "OpenAI" };
  return names[symbol] ?? symbol.charAt(0) + symbol.slice(1).toLowerCase();
}
