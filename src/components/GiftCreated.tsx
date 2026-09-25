"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { GiftCard, ICON } from "./GiftCard";
import { CopyField, ExternalIcon, useCopy, useToast } from "./ui";
import { dialToUrl } from "@/lib/gift";
import { explorerTx } from "@/lib/config";
import { formatUsd } from "@/lib/mint";
import { saveGift } from "@/lib/localGifts";
import { fmtDay, fmtShort, fmtTime } from "@/lib/dates";
import type { PreStock } from "@/lib/prestocks";

export type CreatedGift = {
  wallet: string;
  links: { claim: string; blink: string; recover: string };
  signature: string;
  stock: PreStock;
  usd: number;
  tokens: number;
  netUsd: number;
  message: string;
  from: string;
  savedLocally: boolean;
  unlockAt?: number;
};

export function GiftCreated({ gift, onAnother }: { gift: CreatedGift; onAnother: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const toast = useToast();
  return (
    <>
      {step === 1 ? (
        <SaveRecovery gift={gift} onContinue={() => setStep(2)} toast={toast.show} />
      ) : (
        <ShareClaim gift={gift} onAnother={onAnother} toast={toast.show} />
      )}
      {toast.node}
    </>
  );
}

function cardLock(gift: CreatedGift) {
  return gift.unlockAt
    ? ({ status: "locked", date: fmtShort(new Date(gift.unlockAt)) } as const)
    : ({ status: "claimable" } as const);
}

function Progress({ step }: { step: 1 | 2 }) {
  const items = ["Save recovery link", "Share claim link"];
  return (
    <ol aria-label="Progress" className="m-0 p-0 list-none flex items-center gap-2.5 text-[13.5px]">
      {items.map((label, i) => {
        const n = i + 1;
        const current = n === step;
        const done = n < step;
        return (
          <li key={label} className="contents">
            {i > 0 && <span aria-hidden="true" className="w-8 h-px bg-line" />}
            <span aria-current={current ? "step" : undefined} className={`flex items-center gap-2 ${current ? "font-semibold" : "text-muted"}`}>
              <span
                className={`size-6 rounded-full text-xs flex items-center justify-center ${
                  current || done ? "bg-ink text-ground" : "border-[1.5px] border-faint"
                }`}
              >
                {done ? (
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ICON.check} />
                  </svg>
                ) : (
                  n
                )}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const ACTION_ICON = {
  copy: "M8 8h11v11H8zM5 15.5V6.5A1.5 1.5 0 0 1 6.5 5h9",
  down: "M12 4v11M8 11l4 4 4-4M5 19h14",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
};

function SaveRecovery({ gift, onContinue, toast }: { gift: CreatedGift; onContinue: () => void; toast: (m: string) => void }) {
  const copy = useCopy(toast);
  const [done, setDone] = useState({ copied: false, downloaded: false, saved: gift.savedLocally });
  const [confirmed, setConfirmed] = useState(false);
  const value = `${formatUsd(gift.usd)} of ${gift.stock.name}`;

  function download() {
    const body = [
      "SLING: recovery link",
      "",
      `Gift: ${value} (${gift.tokens.toFixed(4)} ${gift.stock.symbol})`,
      `Gift wallet: ${gift.wallet}`,
      `Created: ${new Date().toISOString()}`,
      "",
      "Open this link to take the gift back if nobody has claimed it.",
      "Anyone with this link can take the gift back. Keep it private.",
      "",
      gift.links.recover,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sling-recovery-${gift.wallet.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDone((d) => ({ ...d, downloaded: true }));
  }

  function saveHere() {
    const ok = saveGift({
      wallet: gift.wallet,
      recoverUrl: gift.links.recover,
      claimUrl: gift.links.claim,
      symbol: gift.stock.symbol,
      name: gift.stock.name,
      usd: gift.usd,
      tokens: gift.tokens,
      message: gift.message,
      signature: gift.signature,
      unlockAt: gift.unlockAt,
    });
    if (ok) setDone((d) => ({ ...d, saved: true }));
    else toast("This browser won't let us save it. Copy or download instead.");
  }

  const actions = [
    { key: "copied", label: "Copy", doneLabel: "Copied", icon: ACTION_ICON.copy, go: async () => { await copy(gift.links.recover, "Recovery link copied"); setDone((d) => ({ ...d, copied: true })); } },
    { key: "downloaded", label: "Download as file", doneLabel: "Downloaded", icon: ACTION_ICON.down, go: download },
    { key: "saved", label: "Save to this browser", doneLabel: "Saved in this browser", icon: ACTION_ICON.save, go: saveHere },
  ] as const;

  return (
    <main className="w-full max-w-[640px] mx-auto px-4 pt-8 sm:pt-12 pb-16 flex flex-col gap-6">
      <Progress step={1} />
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="w-full sm:w-[400px]">
          <GiftCard
            variant="compact"
            symbol={gift.stock.symbol}
            name={gift.stock.name}
            logo={gift.stock.logo}
            usd={gift.usd}
            tokens={gift.tokens}
            {...cardLock(gift)}
          />
        </div>
        <span className="text-sm text-muted flex items-center gap-1.5">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICON.check} />
          </svg>
          Gift created
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[28px] sm:text-[44px] font-semibold tracking-[-0.035em] leading-[1.05]">Save your recovery link.</h1>
        <p className="m-0 text-[15px] sm:text-lg leading-normal text-ink-2">
          It&apos;s the only way to take this gift back if it isn&apos;t claimed
          {gift.unlockAt ? ", and it works even while the gift is locked" : ""}.
        </p>
      </div>

      <section aria-label="Recovery link" className="bg-surface border border-line rounded-[20px] p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold flex items-center gap-2">
            <KeyIcon />
            Recovery link
          </span>
          <span className="h-6 px-2.5 rounded-full bg-surface-2 text-ink-2 text-xs font-semibold flex items-center">Private · keep this one</span>
        </div>
        <div className="px-4 py-3.5 rounded-xl bg-ground font-mono text-[13px] sm:text-sm break-all leading-normal select-all">{gift.links.recover}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {actions.map((a) => {
            const isDone = done[a.key];
            return (
              <button
                key={a.key}
                type="button"
                onClick={a.go}
                aria-pressed={isDone}
                className={`h-12 rounded-xl border bg-surface hover:bg-surface-2 text-sm font-semibold flex items-center justify-center gap-2 ${
                  isDone ? "border-[#8CCBA5] text-green" : "border-line"
                }`}
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d={isDone ? ICON.check : a.icon} />
                </svg>
                {isDone ? a.doneLabel : a.label}
              </button>
            );
          })}
        </div>
      </section>

      <div role="note" className="flex gap-3 px-4 py-3.5 rounded-[14px] border border-amber-line bg-amber-bg text-sm leading-normal text-ink-2">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
        <span>
          <strong className="font-semibold text-ink">Keep it private.</strong> Anyone with this link can take the gift back. It was made in
          your browser, so we can&apos;t send it to you again.
        </span>
      </div>

      <label className="flex items-center gap-3 min-h-12 px-1 text-[15px] font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="size-[22px] m-0 shrink-0 accent-accent"
        />
        I&apos;ve saved my recovery link somewhere safe
      </label>
      <button
        type="button"
        disabled={!confirmed}
        onClick={onContinue}
        className="h-14 rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-base font-semibold disabled:bg-disabled disabled:text-on-disabled disabled:cursor-not-allowed"
      >
        Continue to claim link
      </button>
    </main>
  );
}

function ShareClaim({ gift, onAnother, toast }: { gift: CreatedGift; onAnother: () => void; toast: (m: string) => void }) {
  const copy = useCopy(toast);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(gift.links.claim, { margin: 1, width: 300, errorCorrectionLevel: "M" }).then(setQr);
  }, [gift.links.claim]);

  const value = `${formatUsd(gift.usd)} of ${gift.stock.name}`;
  const tweet = gift.unlockAt
    ? `I just gifted ${value}, pre-IPO, on Solana. It unlocks ${fmtShort(new Date(gift.unlockAt))}. First to claim it then gets it.`
    : `I just gifted ${value}, pre-IPO, on Solana. First to claim it gets it.`;
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(dialToUrl(gift.links.blink))}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(`A gift for you: ${value}, before it goes public. ${gift.links.claim}`)}`;

  return (
    <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-12 lg:px-[120px] pt-8 lg:pt-[72px] pb-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_500px] gap-10 lg:gap-[88px] items-start">
      <div className="flex flex-col gap-10 pt-3">
        <div className="pg-reveal w-full max-w-[540px]">
          <GiftCard
            symbol={gift.stock.symbol}
            name={gift.stock.name}
            logo={gift.stock.logo}
            usd={gift.usd}
            tokens={gift.tokens}
            message={gift.message}
            from={gift.from}
            {...cardLock(gift)}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-green">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON.check} />
            </svg>
            Recovery link saved · Step 2 of 2
          </div>
          <h1 className="m-0 text-[36px] lg:text-[52px] font-semibold tracking-[-0.035em] leading-[1.02]">Your gift is ready.</h1>
          <p className="m-0 text-lg text-muted leading-normal max-w-[520px]">
            Send the claim link to the person it&apos;s for. They can claim <strong className="font-semibold text-ink">{value}</strong>{" "}
            {gift.unlockAt
              ? `from ${fmtDay(new Date(gift.unlockAt))} at ${fmtTime(new Date(gift.unlockAt))}. Until then it stays locked, even to us.`
              : "right away, and it's theirs the moment they do."}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm">
            <Link href="/sent" className="font-semibold text-link hover:underline">
              View in Gifts sent
            </Link>
            <a href={gift.links.recover} className="text-ink-2 hover:underline">
              Recovery page
            </a>
            <a href={explorerTx(gift.signature)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-ink-2 hover:underline">
              View transaction <ExternalIcon />
            </a>
            <button type="button" onClick={onAnother} className="text-ink-2 hover:underline">
              Send another
            </button>
          </div>
        </div>
      </div>

      <section aria-label="Share your gift" className="bg-surface border border-line rounded-3xl p-5 sm:p-7 flex flex-col gap-5">
        <CopyField label="Claim link · share this one" value={gift.links.claim} onCopy={() => copy(gift.links.claim)} />
        <div className="grid grid-cols-2 gap-2">
          <a href={xUrl} target="_blank" rel="noreferrer" className="h-12 rounded-xl border border-line bg-surface hover:bg-surface-2 text-sm font-semibold flex items-center justify-center gap-2">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" />
            </svg>
            Share on X
          </a>
          <a href={waUrl} target="_blank" rel="noreferrer" className="h-12 rounded-xl border border-line bg-surface hover:bg-surface-2 text-sm font-semibold flex items-center justify-center gap-2">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 18.5l1.2-3.4A7.5 7.5 0 1 1 9 18.1z" />
            </svg>
            Share on WhatsApp
          </a>
        </div>
        <p className="m-0 -mt-2 text-[12.5px] text-muted leading-snug">
          Sharing on X posts a Blink anyone can claim from their feed. Great for giveaways; send a DM for one person.
        </p>
        <div className="flex items-center gap-5 p-4 rounded-2xl bg-ground">
          <div className="size-[150px] shrink-0 p-2 rounded-xl bg-white">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code for the gift link" className="size-full" />
            ) : (
              <div className="pg-sk size-full rounded-md" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Scan to claim</span>
            <span className="text-[13px] text-muted leading-[1.45]">Handy for handing over in person or printing inside a card.</span>
            {qr && (
              <a
                href={qr}
                download={`sling-gift-${gift.wallet.slice(0, 6)}.png`}
                className="self-start mt-1 h-11 px-3.5 rounded-[10px] border border-line bg-surface hover:bg-surface-2 text-[13px] font-semibold flex items-center"
              >
                Download QR
              </a>
            )}
          </div>
        </div>
        <div role="note" className="flex gap-3 px-4 py-3.5 rounded-[14px] border border-amber-line bg-amber-bg">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span className="text-sm leading-[1.45] text-ink-2">
            <strong className="font-semibold text-ink">Anyone with this link can claim the gift.</strong> Treat it like cash and only send
            it to the person it&apos;s for.
          </span>
        </div>
      </section>
    </main>
  );
}

export function KeyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
    </svg>
  );
}
