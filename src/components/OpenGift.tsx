"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { GiftCard, ICON, type CardStatus } from "./GiftCard";
import { KeyIcon } from "./GiftCreated";
import { ExternalIcon, Notice, Spinner, useStocks, useToast, walletErrorMessage } from "./ui";
import { buildSweepTx, claimUrl, confirmSignature, giftKeyFor, readFragment, shortAddr, type ClaimSecret } from "@/lib/gift";
import { loadGiftView, type GiftView } from "@/lib/giftView";
import { explorerAccount, explorerTx } from "@/lib/config";
import { formatTokens, formatUsd } from "@/lib/mint";
import { lockSeed, unlockSeed } from "@/lib/timelock";
import { calendarFile, countdown, fmtDay, fmtLong, fmtShort, fmtTime } from "@/lib/dates";

type Mode = "claim" | "recover";

type Status =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "sending"; step: "sign" | "confirm" }
  | { kind: "success"; signature: string }
  | { kind: "failed"; message: string };

/** Where a locked claim link is in opening: waiting on the clock, asking drand, open, or unreadable. */
type LockState = { kind: "none" } | { kind: "waiting" } | { kind: "open"; seed: string } | { kind: "error"; message: string };

const subscribeUrl = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function OpenGift({ wallet, mode }: { wallet: string; mode: Mode }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { stocks, error: stocksError } = useStocks();
  const toast = useToast();

  // null on the server: the fragment only exists in the browser.
  const url = useSyncExternalStore(subscribeUrl, () => window.location.search + window.location.hash, () => null);
  const link = useMemo(() => {
    const [search, hash = ""] = (url ?? "").split("#");
    const f = readFragment(hash);
    const u = Number(new URLSearchParams(search).get("u") ?? f.get("u"));
    return {
      seed: f.get("k"),
      ciphertext: f.get("c"),
      unlockAt: Number.isFinite(u) && u > 0 ? u * 1000 : null,
      extras: { message: f.get("m") ?? "", from: f.get("f") ?? "" },
    };
  }, [url]);
  const { extras } = link;

  const [lock, setLock] = useState<LockState>({ kind: "none" });
  const lockedLink = !!link.ciphertext && !link.seed;
  const openedSeed = lock.kind === "open" ? lock.seed : null;
  const key = useMemo(() => giftKeyFor(wallet, link.seed ?? openedSeed), [wallet, link.seed, openedSeed]);
  const validLink = !!key || (lockedLink && lock.kind !== "error");

  const [view, setView] = useState<GiftView | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const waiting = lockedLink && !key;
  const now = useNow(waiting || (mode === "recover" && !!link.unlockAt));

  useEffect(() => {
    if (!validLink || !stocks) return;
    let alive = true;
    loadGiftView(connection, new PublicKey(wallet), stocks)
      .then((v) => alive && setView(v))
      .catch(() => alive && setLoadError("Couldn't reach the Solana network. Check your connection and refresh."));
    return () => {
      alive = false;
    };
  }, [connection, validLink, stocks, wallet]);

  // Locked claim link: once the clock passes the unlock time, ask drand for the round until it's published.
  useEffect(() => {
    if (!lockedLink || !link.ciphertext || lock.kind === "open" || lock.kind === "error") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = async () => {
      const r = await unlockSeed(link.ciphertext!);
      if (!alive) return;
      if (r.kind === "open") {
        if (giftKeyFor(wallet, r.seed)) setLock({ kind: "open", seed: r.seed });
        else setLock({ kind: "error", message: "This gift link doesn't match its gift wallet." });
      } else if (r.kind === "early") {
        setLock({ kind: "waiting" });
        timer = setTimeout(attempt, 3000);
      } else setLock({ kind: "error", message: r.message });
    };
    const wait = Math.max(0, (link.unlockAt ?? 0) - Date.now());
    timer = setTimeout(attempt, wait);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [lockedLink, link.ciphertext, link.unlockAt, lock.kind, wallet]);

  async function sweep() {
    if (!publicKey || !key || view?.state.kind !== "funded") return;
    setStatus({ kind: "sending", step: "sign" });
    try {
      const tx = await buildSweepTx({
        connection,
        gift: key.publicKey,
        giftTokenAccount: view.state.tokenAccount,
        mint: view.state.mint,
        decimals: view.state.decimals,
        raw: view.state.raw,
        destination: publicKey,
        feePayer: publicKey,
      });
      const signature = await sendTransaction(tx, connection, { signers: [key] });
      setStatus({ kind: "sending", step: "confirm" });
      await confirmSignature(connection, signature, tx.lastValidBlockHeight!);
      setStatus({ kind: "success", signature });
    } catch (e) {
      setStatus({ kind: "failed", message: walletErrorMessage(e) });
    }
  }

  if (url !== null && !validLink) {
    return (
      <Centered>
        <h1 className="m-0 text-[32px] font-semibold tracking-[-0.03em]">
          {lock.kind === "error" ? "This gift couldn't be opened." : "This link is incomplete."}
        </h1>
        <p className="m-0 text-base text-muted leading-normal">
          {lock.kind === "error" ? (
            lock.message
          ) : (
            <>
              The part after the <span className="font-mono">#</span> is missing or damaged, often because a chat app cut it off. Ask
              the sender to send the whole link again.
            </>
          )}
        </p>
        <PrimaryLink href="/">Send a gift of your own</PrimaryLink>
      </Centered>
    );
  }

  if (stocksError || loadError) {
    return (
      <Centered>
        <Notice tone="error">{stocksError ?? loadError}</Notice>
      </Centered>
    );
  }

  if (!view) {
    return (
      <Layout
        stage={<div className="pg-sk w-full max-w-[560px] aspect-[400/252] rounded-[22px]" aria-busy="true" aria-label="Loading gift" />}
        panel={
          <div className="flex flex-col gap-4">
            <div className="pg-sk h-10 w-4/5 rounded-lg" />
            <div className="pg-sk h-5 w-full rounded-md" />
            <div className="pg-sk h-14 w-full rounded-[14px]" />
          </div>
        }
      />
    );
  }

  if (view.state.kind === "missing") {
    return (
      <Centered>
        <h1 className="m-0 text-[32px] font-semibold tracking-[-0.03em]">We couldn&apos;t find this gift.</h1>
        <p className="m-0 text-base text-muted leading-normal">
          Nothing was ever sent to this gift wallet. If it was created a moment ago, wait a few seconds and refresh.
        </p>
        <a href={explorerAccount(wallet)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-link flex items-center gap-1">
          Gift wallet {shortAddr(wallet)} <ExternalIcon />
        </a>
      </Centered>
    );
  }

  const funded = view.state.kind === "funded";
  const done = status.kind === "success";
  // Locked from the viewer's point of view: claim page still waiting on drand, or recovery page before the unlock time.
  const lockedNow = funded && (mode === "claim" ? waiting : !!link.unlockAt && now < link.unlockAt);
  const wasLocked = !!link.unlockAt && lockedLink;

  const ctx: PanelCtx = {
    view,
    wallet,
    extras,
    status,
    publicKey: publicKey?.toBase58() ?? null,
    connect: () => setVisible(true),
    sweep,
    setStatus,
    lockedNow,
    unlockAt: link.unlockAt,
    now,
    wasLocked,
    unlocking: waiting && !!link.unlockAt && now >= link.unlockAt,
  };

  const cardStatus: CardStatus = done
    ? mode === "claim"
      ? "claimed"
      : "takenback"
    : !funded
      ? "gone"
      : lockedNow
        ? "locked"
        : wasLocked
          ? "unlocked"
          : "claimable";
  const stock = view.stock;
  const sender = extras.from || "Someone";

  const stage = (
    <>
      {mode === "claim" && (
        <div className="flex items-center gap-2.5 text-[15px] text-muted">
          <span aria-hidden="true" className="size-8 rounded-full bg-surface text-ink-2 text-sm font-semibold flex items-center justify-center">
            {sender.charAt(0).toUpperCase()}
          </span>
          <span>
            <strong className="font-semibold text-ink">{sender}</strong> sent you a gift
          </span>
        </div>
      )}
      <div
        style={{ boxShadow: "var(--card-ring)" }}
        className={`w-full max-w-[560px] rounded-[22px] ${
          done ? "pg-reveal" : status.kind === "sending" ? "pg-pulse" : mode === "claim" ? "pg-float" : ""
        }`}
      >
        {stock && (
          <GiftCard
            symbol={stock.symbol}
            name={stock.name}
            logo={stock.logo}
            usd={view.usd}
            tokens={view.ui}
            message={extras.message}
            from={extras.from}
            status={cardStatus}
            date={link.unlockAt ? fmtShort(new Date(link.unlockAt)) : undefined}
          />
        )}
      </div>
    </>
  );

  async function copyClaim() {
    if (!link.seed) return;
    const extrasFor = extras;
    // A locked gift's recovery link carries only the plain key, so re-lock it to the same unlock time.
    // Any ciphertext for that drand round opens at exactly the same moment.
    const secret: ClaimSecret =
      link.unlockAt && Date.now() < link.unlockAt
        ? { kind: "locked", ciphertext: await lockSeed(link.seed, link.unlockAt), unlockAt: link.unlockAt }
        : { kind: "key", seed: link.seed };
    await navigator.clipboard.writeText(claimUrl(window.location.origin, wallet, secret, extrasFor));
    toast.show("Claim link copied");
  }

  return (
    <>
      <Layout
        stage={stage}
        panel={mode === "claim" ? <ClaimPanel {...ctx} /> : <TakeBackPanel {...ctx} copyClaim={copyClaim} />}
        tall={mode === "claim"}
      />
      {mode === "recover" && status.kind === "confirming" && stock && (
        <ConfirmTakeBack
          value={`${formatUsd(view.usd)} of ${stock.name}`}
          to={publicKey ? shortAddr(publicKey.toBase58()) : "your wallet"}
          fee={formatUsd(view.usd - view.netUsd)}
          onCancel={() => setStatus({ kind: "idle" })}
          onConfirm={sweep}
        />
      )}
      {toast.node}
    </>
  );
}

type PanelCtx = {
  view: GiftView;
  wallet: string;
  extras: { message: string; from: string };
  status: Status;
  publicKey: string | null;
  connect: () => void;
  sweep: () => void;
  setStatus: (s: Status) => void;
  /** Funded but can't be claimed yet. */
  lockedNow: boolean;
  unlockAt: number | null;
  now: number;
  /** The claim link was time-locked (and is now open). */
  wasLocked: boolean;
  /** Past the unlock time, waiting for drand to publish the round (a few seconds). */
  unlocking: boolean;
};

function Layout({ stage, panel, tall }: { stage: React.ReactNode; panel: React.ReactNode; tall?: boolean }) {
  return (
    <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-12 lg:px-24 pt-4 lg:pt-10 pb-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px] gap-6 lg:gap-20 items-start">
      <div
        className={`rounded-[28px] lg:rounded-[36px] bg-stage flex flex-col items-center justify-center gap-6 lg:gap-9 p-5 sm:p-10 ${
          tall ? "lg:h-[820px]" : "lg:h-[720px]"
        }`}
      >
        {stage}
      </div>
      <div className={tall ? "lg:pt-[110px]" : "lg:pt-20"}>{panel}</div>
    </main>
  );
}

function ClaimPanel({ view, wallet, extras, status, publicKey, connect, sweep, lockedNow, unlockAt, now, wasLocked, unlocking }: PanelCtx) {
  const [open, setOpen] = useState(false);
  const stock = view.stock;
  const name = stock?.name ?? "a PreStock";
  const amountName = `${formatUsd(view.usd)} of ${name}`;
  const funded = view.state.kind === "funded";
  const sender = extras.from || "the sender";

  let body: React.ReactNode;
  if (status.kind === "sending") {
    const approved = status.step === "confirm";
    body = (
      <div className="flex flex-col gap-4">
        <H1>Claiming your gift…</H1>
        <ol className="m-0 px-3.5 py-1.5 list-none rounded-[14px] bg-surface border border-line">
          <Step state={approved ? "done" : "active"}>{approved ? "Approved in your wallet" : "Approve in your wallet"}</Step>
          <Step state={approved ? "active" : "todo"}>Moving {name} to your wallet</Step>
          <Step state="todo" last>
            Done
          </Step>
        </ol>
        <button type="button" disabled aria-busy="true" className="h-14 rounded-[14px] bg-accent text-on-accent opacity-70 text-base font-semibold flex items-center justify-center gap-2.5 cursor-progress">
          <Spinner /> Claiming…
        </button>
        <p className="m-0 text-[13px] text-muted text-center">This usually takes a few seconds. Keep this page open.</p>
      </div>
    );
  } else if (status.kind === "success") {
    body = (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2">
          <Eyebrow>Claimed</Eyebrow>
          <H1>You now own a piece of {name}.</H1>
          <P>
            ≈ {formatUsd(view.netUsd)} of {name} (
            <span className="font-mono text-ink">
              {formatTokens(view.netUi)} {stock?.symbol}
            </span>
            ) is now in {publicKey ? shortAddr(publicKey) : "your wallet"}.
          </P>
        </div>
        <PrimaryLink href="/">Send a gift of your own</PrimaryLink>
        <SecondaryA href={explorerTx(status.signature)}>View on Solana Explorer</SecondaryA>
        <div className="p-3.5 rounded-[14px] bg-surface-2 flex flex-col gap-1 text-[13.5px] leading-[1.45]">
          <strong className="font-semibold">What is a PreStock?</strong>
          <span className="text-muted">
            A token on Solana that tracks the value of a private company&apos;s shares before it goes public. It sits in your wallet
            like any other token.{" "}
            {stock && (
              <a href={stock.url} target="_blank" rel="noreferrer" className="font-semibold text-link">
                Learn more
              </a>
            )}
          </span>
        </div>
      </div>
    );
  } else if (!funded) {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-2xl lg:text-4xl font-semibold tracking-[-0.025em] leading-[1.15]">
            This gift has already been claimed or taken back by the sender.
          </h1>
          <P>Each gift can only be used once. If you were expecting it, check with {sender}.</P>
        </div>
        <PrimaryLink href="/">Send a gift of your own</PrimaryLink>
        <a href={explorerAccount(wallet)} target="_blank" rel="noreferrer" className="h-11 flex items-center justify-center text-sm font-semibold text-link">
          View gift wallet on Solana Explorer ↗
        </a>
      </div>
    );
  } else if (lockedNow && unlockAt) {
    const cd = countdown(unlockAt - now);
    const opens = new Date(unlockAt);
    body = (
      <div className="flex flex-col gap-4">
        <H1>{unlocking ? "Opening your gift…" : `Opens in ${cd.label}.`}</H1>
        <div role="timer" aria-label="Time until the gift opens" className="grid grid-cols-4 gap-2">
          {cd.parts.map((p) => (
            <div key={p.l} className="h-[68px] lg:h-[84px] rounded-[14px] bg-surface border border-line flex flex-col items-center justify-center gap-0.5">
              <span className="text-[26px] lg:text-[32px] font-semibold tracking-[-0.02em]">{p.v}</span>
              <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-muted">{p.l}</span>
            </div>
          ))}
        </div>
        <P>
          This gift opens on <strong className="font-semibold text-ink">{fmtLong(opens)}</strong>. You can claim it any time after
          that.
        </P>
        <PrimaryButton
          onClick={() => {
            const ics = calendarFile(`Open your ${name} gift`, opens, window.location.href);
            const href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
            const a = document.createElement("a");
            a.href = href;
            a.download = "sling-gift.ics";
            a.click();
            URL.revokeObjectURL(href);
          }}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5.5" width="16" height="14" rx="2" />
            <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
          </svg>
          Add to calendar
        </PrimaryButton>
        <p className="m-0 text-[12.5px] text-muted flex items-center gap-1.5">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICON.lock} />
          </svg>
          Locked gifts can&apos;t be opened early by anyone, including us.
        </p>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {wasLocked && unlockAt && (
            <span className="self-start h-[26px] px-2.5 rounded-full bg-green-bg text-green text-[12.5px] font-semibold flex items-center gap-1.5">
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON.unlock} />
              </svg>
              Unlocked · opened {fmtShort(new Date(unlockAt))}
            </span>
          )}
          <H1>You&apos;ve received {amountName}.</H1>
          {status.kind !== "failed" && <P>A piece of {name} before it goes public. Claim it to your Solana wallet in one tap.</P>}
        </div>
        {status.kind === "failed" && (
          <div role="alert" className="flex gap-3 p-3.5 rounded-[14px] bg-red-bg">
            <AlertIcon />
            <div className="flex flex-col gap-0.5 text-sm leading-[1.45]">
              <strong className="font-semibold">The claim didn&apos;t go through.</strong>
              <span className="text-ink-2">{status.message} The gift is still in its gift wallet, so you can try again.</span>
            </div>
          </div>
        )}
        {publicKey ? (
          <PrimaryButton onClick={sweep}>{status.kind === "failed" ? "Try again" : "Claim gift"}</PrimaryButton>
        ) : (
          <PrimaryButton onClick={connect}>Connect wallet to claim</PrimaryButton>
        )}
        {publicKey && (
          <p className="m-0 -mt-2 text-center text-[13px] text-muted">
            Goes to {shortAddr(publicKey)}. You pay the network fee (under $0.01, plus ≈0.002 SOL if it&apos;s your first {stock?.symbol}).
          </p>
        )}
      </div>
    );
  }

  const showMeta = status.kind !== "sending" && status.kind !== "success";
  const showHelp = showMeta && funded;
  const helpTitle = lockedNow ? "Get ready before it opens" : "New to Solana wallets?";

  const deadline = stock?.deadline ? new Date(`${stock.deadline}T09:00`) : null;
  return (
    <div className="flex flex-col gap-4">
      {deadline && funded && status.kind !== "success" && (
        <div role="note" className="flex gap-2.5 px-3.5 py-3 rounded-[14px] bg-amber-bg text-amber-ink text-[13.5px] lg:text-sm leading-[1.45]">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
            <path d="M12 4l9 16H3z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
          <span>
            <strong className="font-semibold">Claim before {fmtDay(deadline)}.</strong> After that this token can no longer be
            converted.
          </span>
        </div>
      )}
      {body}
      {showMeta && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            {stock && (
              <a href={stock.url} target="_blank" rel="noreferrer" className="h-11 flex items-center text-sm font-semibold text-link">
                What is a PreStock?
              </a>
            )}
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-11 px-1 text-sm font-medium text-ink-2 flex items-center gap-1">
              Details
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          {open && (
            <div className="px-3.5 pt-1 pb-3 rounded-[14px] bg-surface border border-line text-[13px]">
              <dl className="m-0">
                <DRow label="Gift wallet">
                  <a href={explorerAccount(wallet)} target="_blank" rel="noreferrer" className="font-mono text-link">
                    {shortAddr(wallet)} ↗
                  </a>
                </DRow>
                <DRow label="Token">
                  <span className="font-mono">
                    {formatTokens(view.ui)} {stock?.symbol}
                  </span>
                </DRow>
                <DRow label="Transfer fee" last>
                  ≈ {formatUsd(view.usd - view.netUsd)}, charged by the token
                </DRow>
              </dl>
              <p className="mt-2.5 mb-0 leading-[1.45] text-muted">
                No smart contract. Your gift sits in its own wallet until someone claims it. The token issuer can move tokens in any
                account; this is a standard feature of these tokens.
              </p>
            </div>
          )}
          {showHelp && (
            <>
              <div className="flex gap-3 p-3.5 rounded-[14px] bg-surface-2">
                <WalletIcon />
                <div className="flex flex-col gap-0.5 text-[13.5px] leading-[1.4]">
                  <strong className="font-semibold">{helpTitle}</strong>
                  <span className="text-muted">
                    You&apos;ll need a free wallet app to hold your gift. It takes about two minutes.{" "}
                    <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="font-semibold text-link">
                      Get a wallet
                    </a>
                  </span>
                </div>
              </div>
              <p className="m-0 text-xs leading-[1.45] text-muted">
                PreStocks aren&apos;t available in every country, including to U.S. persons, and give no ownership, voting or dividend
                rights.{" "}
                <a href="https://prestocks.com" target="_blank" rel="noreferrer" className="text-link">
                  Check who can hold them
                </a>{" "}
                before claiming.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TakeBackPanel({
  view,
  wallet,
  status,
  publicKey,
  connect,
  setStatus,
  copyClaim,
  lockedNow,
  unlockAt,
}: PanelCtx & { copyClaim: () => void }) {
  const stock = view.stock;
  const name = stock?.name ?? "a PreStock";
  const funded = view.state.kind === "funded";

  let body: React.ReactNode;
  if (status.kind === "success") {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Back in your wallet</Eyebrow>
          <H1>Gift taken back.</H1>
          <P>
            ≈ {formatUsd(view.netUsd)} of {name} (
            <span className="font-mono text-ink">
              {formatTokens(view.netUi)} {stock?.symbol}
            </span>
            ) is back in {publicKey ? shortAddr(publicKey) : "your wallet"}. The claim link no longer works.
          </P>
        </div>
        <PrimaryLink href="/">Create a new gift</PrimaryLink>
        <SecondaryA href={explorerTx(status.signature)}>View on Solana Explorer</SecondaryA>
      </div>
    );
  } else if (!funded) {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-2xl lg:text-4xl font-semibold tracking-[-0.025em] leading-[1.15]">
            This gift has already been claimed or taken back.
          </h1>
          <P>The gift wallet is empty, so there&apos;s nothing left to take back.</P>
        </div>
        <SecondaryA href={explorerAccount(wallet)}>View gift wallet on Solana Explorer</SecondaryA>
        <Link href="/" className="h-11 flex items-center justify-center text-[15px] font-semibold text-link">
          Create a new gift
        </Link>
      </div>
    );
  } else {
    const sending = status.kind === "sending";
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <H1>{lockedNow ? "Still locked, and still yours to take back." : "This gift hasn\u2019t been claimed yet."}</H1>
          <P>
            {lockedNow && unlockAt
              ? `The claim link opens on ${fmtDay(new Date(unlockAt))} at ${fmtTime(new Date(unlockAt))}. Until someone claims it, you can take it back to your connected wallet.`
              : "You can always take back a gift that hasn\u2019t been claimed. It returns to your connected wallet."}
          </P>
        </div>
        {status.kind === "failed" && (
          <Notice tone="error">
            <span>{status.message} The gift is still in its gift wallet.</span>
          </Notice>
        )}
        {publicKey ? (
          <PrimaryButton onClick={() => setStatus({ kind: "confirming" })} busy={sending}>
            {sending ? (
              <>
                <Spinner /> {status.step === "sign" ? "Confirm in your wallet…" : "Taking it back…"}
              </>
            ) : (
              <>
                <BackIcon /> Take it back
              </>
            )}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={connect}>Connect wallet to take it back</PrimaryButton>
        )}
        <button
          type="button"
          onClick={copyClaim}
          className="h-12 rounded-[14px] border border-line bg-surface hover:bg-surface-2 text-[15px] font-semibold flex items-center justify-center gap-2"
        >
          <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="11" height="11" rx="2.5" />
            <path d="M5 15.5V6.5A1.5 1.5 0 0 1 6.5 5h9" />
          </svg>
          Copy claim link
        </button>
        <dl className="m-0 px-3.5 py-1 rounded-[14px] bg-surface border border-line text-[13px]">
          <DRow label="Goes back to">
            <span className="font-mono">{publicKey ? shortAddr(publicKey) : "Connect a wallet"}</span>
          </DRow>
          <DRow label="Gift wallet">
            <a href={explorerAccount(wallet)} target="_blank" rel="noreferrer" className="font-mono text-link">
              {shortAddr(wallet)} ↗
            </a>
          </DRow>
          <DRow label="Transfer fee" last>
            ≈ {formatUsd(view.usd - view.netUsd)}, charged by the token
          </DRow>
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="self-start h-7 px-3 rounded-full bg-surface-2 text-ink-2 text-[12.5px] font-semibold flex items-center gap-1.5">
        <KeyIcon size={14} />
        Recovery page · keep this link private
      </span>
      {body}
    </div>
  );
}

function ConfirmTakeBack({
  value,
  to,
  fee,
  onCancel,
  onConfirm,
}: {
  value: string;
  to: string;
  fee: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancelRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(22,23,26,0.5)]" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tbd"
        aria-describedby="tbdd"
        className="relative w-full sm:w-[460px] p-7 rounded-t-3xl sm:rounded-3xl bg-surface flex flex-col gap-5 shadow-[0_30px_60px_-20px_rgba(22,23,26,0.4)]"
      >
        <div className="flex flex-col gap-2">
          <h2 id="tbd" className="m-0 text-2xl font-semibold tracking-[-0.02em]">
            Take back {value}?
          </h2>
          <p id="tbdd" className="m-0 text-[15px] leading-normal text-ink-2">
            <strong className="font-semibold text-ink">The claim link will stop working.</strong> The tokens go to {to}. A small token
            transfer fee applies (≈ {fee}).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button ref={cancelRef} type="button" onClick={onCancel} className="h-[52px] rounded-[14px] border border-line bg-surface hover:bg-surface-2 text-[15px] font-semibold">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="h-[52px] rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-[15px] font-semibold">
            Take it back
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- small pieces ----------

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="w-full max-w-[520px] mx-auto px-4 py-16 flex flex-col gap-5">{children}</main>;
}

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="m-0 text-[26px] lg:text-[44px] font-semibold tracking-[-0.03em] leading-[1.1]">{children}</h1>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[15px] lg:text-[17px] leading-normal text-muted">{children}</p>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON.check} />
      </svg>
      {children}
    </span>
  );
}

function PrimaryButton({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className="h-[52px] lg:h-14 rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-base font-semibold flex items-center justify-center gap-2 aria-busy:opacity-70 aria-busy:cursor-progress"
    >
      {children}
    </button>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="h-[52px] lg:h-14 rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-base font-semibold flex items-center justify-center">
      {children}
    </Link>
  );
}

function SecondaryA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="h-12 rounded-[14px] border border-line bg-surface hover:bg-surface-2 text-[15px] font-semibold flex items-center justify-center gap-1.5">
      {children} <ExternalIcon />
    </a>
  );
}

function DRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-2.5 ${last ? "" : "border-b border-line"}`}>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

function Step({ state, last, children }: { state: "done" | "active" | "todo"; last?: boolean; children: React.ReactNode }) {
  return (
    <li className={`h-12 flex items-center gap-3 text-sm ${last ? "" : "border-b border-line"} ${state === "active" ? "font-semibold" : state === "todo" ? "text-muted" : ""}`}>
      {state === "done" && (
        <span className="size-[22px] rounded-full bg-green-bg text-green flex items-center justify-center">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICON.check} />
          </svg>
        </span>
      )}
      {state === "active" && (
        <span className="size-[22px] flex items-center justify-center text-accent">
          <Spinner size={20} />
        </span>
      )}
      {state === "todo" && <span className="size-[22px] rounded-full border-[1.5px] border-line" />}
      {children}
    </li>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px text-ink-2">
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
      <path d="M16 12.5h4.5M3.5 9.5h17" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON.back} />
    </svg>
  );
}

