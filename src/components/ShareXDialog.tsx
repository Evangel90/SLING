"use client";

import { useEffect, useRef, useState } from "react";
import type { CreatedGift } from "./GiftCreated";
import { formatUsd } from "@/lib/mint";
import { fmtShort } from "@/lib/dates";

const X_LIMIT = 280;
const X_URL_LENGTH = 23; // X counts every link as 23 characters

function defaultPost(gift: CreatedGift) {
  const value = `${formatUsd(gift.usd)} of ${gift.stock.name}`;
  const opener = gift.message ? `${gift.message.trim()} ` : "";
  const when = gift.unlockAt ? ` It opens ${fmtShort(new Date(gift.unlockAt))}.` : "";
  return `${opener}I sent you ${value} before it goes public.${when} Claim it here:`;
}

/** Same public details the /b link preview uses, never the key. */
function previewImage(gift: CreatedGift) {
  const q = new URLSearchParams({
    s: gift.stock.symbol,
    n: gift.stock.name,
    st: gift.unlockAt ? "locked" : "claimable",
    usd: gift.usd.toFixed(2),
    t: gift.tokens.toFixed(4),
    layout: "wide",
  });
  if (gift.unlockAt) q.set("d", fmtShort(new Date(gift.unlockAt)));
  if (gift.message) q.set("m", gift.message);
  if (gift.from) q.set("f", gift.from);
  return `/api/actions/image?${q}`;
}

export function ShareXDialog({ gift, onClose, toast }: { gift: CreatedGift; onClose: () => void; toast: (m: string) => void }) {
  const [text, setText] = useState(() => defaultPost(gift));
  const closeRef = useRef<HTMLButtonElement>(null);
  const image = previewImage(gift);
  const count = text.length + 1 + X_URL_LENGTH;
  const over = count > X_LIMIT;
  const host = new URL(gift.links.share).host;
  const name = gift.from || "You";
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(gift.links.share)}`;

  // Latest onClose without re-running the mount effect (which would steal focus from the textarea).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function downloadImage() {
    try {
      const blob = await fetch(image).then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sling-gift-${gift.stock.symbol.toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Couldn't download the image. Try again.");
    }
  }

  async function copyText() {
    await navigator.clipboard.writeText(`${text} ${gift.links.share}`);
    toast("Post text copied");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-start justify-center sm:pt-14">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(22,23,26,0.5)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sx"
        className="relative w-full sm:w-[640px] max-h-[92vh] overflow-y-auto px-4 sm:px-6 pt-2.5 sm:pt-6 pb-6 rounded-t-3xl sm:rounded-3xl bg-surface flex flex-col gap-3 sm:gap-4 shadow-[0_30px_60px_-20px_rgba(22,23,26,0.45)]"
      >
        <span aria-hidden="true" className="sm:hidden self-center w-10 h-[5px] rounded-sm bg-line" />
        <div className="flex items-center justify-between">
          <h2 id="sx" className="m-0 text-xl sm:text-[22px] font-semibold tracking-[-0.02em]">
            Share on X
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="size-11 rounded-xl bg-surface-2 text-ink flex items-center justify-center"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="border border-line rounded-2xl sm:rounded-[18px] p-3 sm:p-4 flex gap-3">
          <span aria-hidden="true" className="hidden sm:flex size-10 shrink-0 rounded-full bg-surface-2 text-ink-2 text-[15px] font-semibold items-center justify-center">
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="grow min-w-0 flex flex-col gap-2 sm:gap-2.5">
            <span className="hidden sm:block text-sm">
              <strong className="font-semibold">{name}</strong> <span className="text-muted">· preview</span>
            </span>
            <label className="flex flex-col gap-1">
              <span className="sr-only">Post text</span>
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full resize-none p-0 border-0 bg-transparent text-[15px] sm:text-base leading-[1.45] outline-offset-4"
              />
              <span className="text-sm sm:text-[15px] text-[#1D6FD1] truncate">{gift.links.share.replace(/^https?:\/\//, "")}</span>
            </label>
            <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-line aspect-[1200/630] bg-stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={`Share image: ${formatUsd(gift.usd)} of ${gift.stock.name}`} className="size-full object-cover" />
            </div>
            <span className="hidden sm:block text-[13px] text-muted">From {host}</span>
            <span className="sm:hidden flex justify-between text-xs text-muted">
              <span>Image appears when you post the link</span>
              <span className={over ? "text-red" : ""}>
                {count} / {X_LIMIT}
              </span>
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center justify-between text-[13px] text-muted">
          <span>X shows the card image automatically when you post the link.</span>
          <span className={over ? "text-red" : ""}>
            {count} / {X_LIMIT}
          </span>
        </div>

        <div role="note" className="flex gap-2.5 px-3 sm:px-3.5 py-2.5 sm:py-3 rounded-xl sm:rounded-[14px] border border-amber-line bg-amber-bg text-[13px] sm:text-[13.5px] leading-[1.45] text-ink-2">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
            <path d="M12 4l9 16H3z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
          <span>
            <strong className="font-semibold text-ink">
              <span className="sm:hidden">Anyone on X can claim it first.</span>
              <span className="hidden sm:inline">A public post means anyone on X can claim it first.</span>
            </strong>{" "}
            <span className="sm:hidden">For one person, send it in a DM.</span>
            <span className="hidden sm:inline">Great for giveaways. For one person, send the link in a DM instead.</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_1fr] gap-2">
          <a
            href={over ? undefined : intent}
            aria-disabled={over}
            target="_blank"
            rel="noopener noreferrer"
            className={`col-span-2 sm:col-span-1 h-[52px] rounded-[14px] bg-ink text-ground text-base sm:text-[15px] font-semibold flex items-center justify-center gap-2 ${
              over ? "opacity-50 pointer-events-none" : "hover:opacity-90"
            }`}
          >
            Post on X
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={downloadImage}
            className="h-12 sm:h-[52px] rounded-xl sm:rounded-[14px] border border-line bg-surface hover:bg-surface-2 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
            </svg>
            <span className="sm:hidden">Save image</span>
            <span className="hidden sm:inline">Download image</span>
          </button>
          <button
            type="button"
            onClick={copyText}
            className="h-12 sm:h-[52px] rounded-xl sm:rounded-[14px] border border-line bg-surface hover:bg-surface-2 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="8" y="8" width="11" height="11" rx="2.5" />
              <path d="M5 15.5V6.5A1.5 1.5 0 0 1 6.5 5h9" />
            </svg>
            Copy text
          </button>
        </div>
      </div>
    </div>
  );
}
