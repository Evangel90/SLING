"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { GiftCard, StockTile, ICON } from "./GiftCard";
import { GiftCreated, type CreatedGift } from "./GiftCreated";
import { Notice, Spinner, useStocks, walletErrorMessage } from "./ui";
import { loadMintInfo, netAfterTwoHops, rawToUi, uiToRaw, formatTokens, formatUsd, type MintInfo } from "@/lib/mint";
import {
  FROM_MAX,
  MESSAGE_MAX,
  shareUrl,
  buildCreateTx,
  claimUrl,
  confirmSignature,
  newGiftKey,
  recoverUrl,
  type ClaimSecret,
} from "@/lib/gift";
import { saveGift } from "@/lib/localGifts";
import { DEADLINE_BUFFER_DAYS } from "@/lib/config";
import { LOCK_MAX_MS, LOCK_MIN_MS, lockSeed } from "@/lib/timelock";
import { TIME_ZONES, fmtDayIn, fmtShortIn, fmtTimeIn, isoIn, localZone, tzNameIn, wallTime } from "@/lib/dates";

const QUICK = [10, 25, 50, 100];
// Gift token-account rent (~0.0021 SOL) plus priority/network fees, with headroom.
const MIN_SOL = 0.003;
const STEPS = ["Company", "Amount", "Unlock date · optional", "Message · optional", "Review"];

type Phase = "form" | "locking" | "signing" | "confirming";
type Preset = "1w" | "1m" | "custom";

/** 9:00 in `zone`, `days` after today's date there. */
function daysFromTodayAt9(now: number, days: number, zone: string) {
  const [y, m, d] = isoIn(now, zone).date.split("-").map(Number);
  return wallTime(y, m, d + days, 9, 0, zone);
}

function assertStillFuture(unlockAt: number) {
  if (unlockAt - Date.now() < LOCK_MIN_MS) throw new Error("The unlock time has passed. Pick a later time.");
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function CreateGift() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { stocks, error: stocksError } = useStocks();
  const now = useNow(15_000);

  const [symbol, setSymbol] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [tip, setTip] = useState(false);
  const [mode, setMode] = useState<"now" | "lock">("now");
  const [preset, setPreset] = useState<Preset>("1w");
  const [tz, setTz] = useState("local");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const [mstep, setMstep] = useState(1);
  const [mintState, setMintState] = useState<{ mint: string; info?: MintInfo; error?: string } | null>(null);
  const [wallet, setWallet] = useState<{ owner: string; balances: Map<string, bigint>; sol: number | null; check: number } | null>(null);
  const [balanceCheck, setBalanceCheck] = useState(0);
  const [phase, setPhase] = useState<Phase>("form");
  const [txError, setTxError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedGift | null>(null);

  const stock = useMemo(
    () => stocks?.find((s) => s.symbol === symbol) ?? stocks?.[0] ?? null,
    [stocks, symbol],
  );

  useEffect(() => {
    if (!stock) return;
    let alive = true;
    loadMintInfo(connection, new PublicKey(stock.mint))
      .then((info) => alive && setMintState({ mint: stock.mint, info }))
      .catch((e: Error) => alive && setMintState({ mint: stock.mint, error: e.message }));
    return () => {
      alive = false;
    };
  }, [connection, stock]);

  useEffect(() => {
    if (!publicKey) return;
    const owner = publicKey.toBase58();
    let alive = true;
    Promise.all([
      connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_2022_PROGRAM_ID }),
      connection.getBalance(publicKey),
    ])
      .then(([tokens, lamports]) => {
        const m = new Map<string, bigint>();
        for (const a of tokens.value) {
          const info = a.account.data.parsed.info as { mint: string; tokenAmount: { amount: string } };
          m.set(info.mint, (m.get(info.mint) ?? 0n) + BigInt(info.tokenAmount.amount));
        }
        if (alive) setWallet({ owner, balances: m, sol: lamports / LAMPORTS_PER_SOL, check: balanceCheck });
      })
      .catch(() => alive && setWallet({ owner, balances: new Map(), sol: null, check: balanceCheck }));
    return () => {
      alive = false;
    };
  }, [connection, publicKey, created, balanceCheck]);

  if (created) {
    return (
      <GiftCreated
        gift={created}
        onAnother={() => {
          setCreated(null);
          setPhase("form");
          setMstep(1);
        }}
      />
    );
  }

  // ---------- derived ----------
  const current = mintState && stock && mintState.mint === stock.mint ? mintState : null;
  const mintInfo = current?.info ?? null;
  const mintError = current?.error ?? null;
  const mine = wallet && publicKey && wallet.owner === publicKey.toBase58() ? wallet : null;
  const balances = mine?.balances ?? null;
  const refreshing = !!mine && mine.check !== balanceCheck;
  const solBalance = mine?.sol ?? null;

  const usd = parseFloat(amount) || 0;
  const price = stock?.tokenPrice ?? 0;
  const ui = price > 0 ? usd / price : 0;
  const raw = mintInfo ? uiToRaw(mintInfo, ui) : 0n;
  const netUsd = (mintInfo ? rawToUi(mintInfo, netAfterTwoHops(mintInfo, raw)) : 0) * price;

  const heldRaw = stock && balances ? (balances.get(stock.mint) ?? 0n) : 0n;
  const heldUsd = (mintInfo ? rawToUi(mintInfo, heldRaw) : 0) * price;

  const insufficient = !!publicKey && !!balances && raw > heldRaw;
  let amountError: string | null = null;
  if (usd > 0 && usd < 1) amountError = "Gifts start at $1.";
  else if (insufficient)
    amountError =
      heldRaw === 0n
        ? `You don’t hold any ${stock?.name} in this wallet yet.`
        : `You have ${formatUsd(heldUsd)} of ${stock?.name} in this wallet. Lower the amount to continue.`;
  const solError =
    publicKey && solBalance !== null && solBalance < MIN_SOL
      ? `You need about ${MIN_SOL} SOL in this wallet for the gift's account rent and network fees.`
      : null;
  const maxUsd = Math.floor(heldUsd * 100) / 100 - 0.01;

  const locked = mode === "lock";
  // The lock is set on the recipient's clock: dates and times below are read in `zone`.
  const myZone = localZone();
  const zone = tz === "local" ? myZone : tz;
  const zoneLabel = TIME_ZONES.find((z) => z.value === tz && tz !== "local")?.label.replace(/\s*\(.*\)$/, "") ?? "your time zone";
  let unlockAt: number | null = null;
  if (locked) {
    if (preset === "custom") {
      const [y, m, d] = customDate.split("-").map(Number);
      const [hh, mm] = (customTime || "00:00").split(":").map(Number);
      const t = y && m && d ? wallTime(y, m, d, hh || 0, mm || 0, zone) : NaN;
      unlockAt = Number.isFinite(t) ? t : null;
    } else unlockAt = daysFromTodayAt9(now, preset === "1w" ? 7 : 30, zone);
  }
  // Conversion deadline: the gift must open at least a week before it, or it could expire unclaimed.
  const [dy, dm, dd] = (stock?.deadline ?? "").split("-").map(Number);
  const deadline = stock?.deadline ? new Date(wallTime(dy, dm, dd, 9, 0, zone)) : null;
  const latestUnlock = deadline ? wallTime(dy, dm, dd - DEADLINE_BUFFER_DAYS, 9, 0, zone) : null;
  let capped = false;
  if (locked && unlockAt && latestUnlock && unlockAt > latestUnlock) {
    unlockAt = latestUnlock;
    capped = true;
  }
  let lockError: string | null = null;
  if (locked) {
    if (latestUnlock && latestUnlock - now < LOCK_MIN_MS)
      lockError = `${stock?.name} is too close to its conversion deadline to lock. Send it to open right away instead.`;
    else if (!unlockAt) lockError = "Pick a date and time.";
    else if (unlockAt <= now)
      lockError = `That time has already passed${tz === "local" ? "" : ` in ${zoneLabel}`}. Pick a later date or time.`;
    else if (unlockAt - now < LOCK_MIN_MS) lockError = "Pick a time at least a minute from now.";
    else if (unlockAt - now > LOCK_MAX_MS) lockError = "Locks can be at most 5 years.";
  }
  const openDate = unlockAt ? new Date(unlockAt) : null;
  const zoneAbbr = tzNameIn(openDate ?? new Date(now), zone);
  const opensLabel = openDate ? `${fmtDayIn(openDate, zone)}, ${fmtTimeIn(openDate, zone)} ${tzNameIn(openDate, zone)}` : null;
  const localNote =
    openDate && zone !== myZone && (fmtTimeIn(openDate, zone) !== fmtTimeIn(openDate, myZone) || fmtDayIn(openDate, zone) !== fmtDayIn(openDate, myZone))
      ? `That’s ${fmtTimeIn(openDate, myZone)} on ${fmtDayIn(openDate, myZone, true)} in your time (${tzNameIn(openDate, myZone)}).`
      : null;

  const busy = phase !== "form";
  const amountOk = !!mintInfo && raw > 0n && !amountError;
  const canSubmit = !!stock && amountOk && !solError && !lockError && !busy;
  const stepOk = [true, !!stock, amountOk, !lockError, true, canSubmit];

  const q2 = q.trim().toLowerCase();
  const tiles = (stocks ?? []).filter(
    (s) => !q2 || s.name.toLowerCase().includes(q2) || s.symbol.toLowerCase().includes(q2),
  );

  function pickPreset(p: Preset) {
    setPreset(p);
    if (p === "custom") {
      const base = isoIn(unlockAt ?? daysFromTodayAt9(now, 1, zone), zone);
      setCustomDate(base.date);
      setCustomTime(base.time);
    }
  }

  /** Keep the same moment when switching zones: a custom date/time is converted to the new zone's clock. */
  function changeZone(next: string) {
    const nextZone = next === "local" ? myZone : next;
    if (preset === "custom" && unlockAt && unlockAt > now) {
      const w = isoIn(unlockAt, nextZone);
      setCustomDate(w.date);
      setCustomTime(w.time);
    }
    setTz(next);
  }

  function pickMode(m: "now" | "lock") {
    setMode(m);
    if (m === "lock" && preset === "custom" && !customDate) pickPreset("custom");
  }

  async function create() {
    if (!publicKey || !stock || !mintInfo) return;
    setTxError(null);
    try {
      const { keypair, seed } = newGiftKey();
      const giftWallet = keypair.publicKey.toBase58();
      const origin = window.location.origin;
      const extras = { message: message.trim(), from: from.trim() };

      let secret: ClaimSecret = { kind: "key", seed };
      if (locked && unlockAt) {
        assertStillFuture(unlockAt);
        setPhase("locking");
        secret = { kind: "locked", ciphertext: await lockSeed(seed, unlockAt), unlockAt };
      }
      const links = {
        claim: claimUrl(origin, giftWallet, secret, extras),
        share: shareUrl(origin, giftWallet, secret, extras),
        recover: recoverUrl(origin, giftWallet, seed, extras, secret.kind === "locked" ? unlockAt! : undefined),
      };

      setPhase("signing");
      const tx = await buildCreateTx({
        connection,
        sender: publicKey,
        gift: keypair.publicKey,
        mint: mintInfo.mint,
        decimals: mintInfo.decimals,
        raw,
      });

      // Persist the recovery key before the funds move, so a crashed tab can't strand the gift.
      const record = {
        wallet: giftWallet,
        recoverUrl: links.recover,
        claimUrl: links.claim,
        symbol: stock.symbol,
        name: stock.name,
        usd,
        tokens: ui,
        message: extras.message,
        unlockAt: secret.kind === "locked" ? unlockAt! : undefined,
      };
      const savedLocally = saveGift(record);

      const signature = await sendTransaction(tx, connection);
      setPhase("confirming");
      await confirmSignature(connection, signature, tx.lastValidBlockHeight!);
      saveGift({ ...record, signature });

      setCreated({
        wallet: giftWallet,
        links,
        signature,
        stock,
        usd,
        tokens: ui,
        netUsd,
        message: extras.message,
        from: extras.from,
        savedLocally,
        unlockAt: record.unlockAt,
      });
    } catch (e) {
      setTxError(walletErrorMessage(e));
      setPhase("form");
    }
  }

  // Mobile shows one step at a time; desktop shows everything.
  const only = (n: number) => `${mstep === n ? "flex" : "hidden"} lg:flex`;
  const cardStatus = locked && openDate ? "locked" : "claimable";

  return (
    <main className="w-full max-w-[1344px] mx-auto px-4 sm:px-12 pt-4 lg:pt-12 pb-32 lg:pb-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_480px] gap-5 lg:gap-[72px] items-start">
      <div className="flex flex-col gap-4">
        {/* Mobile wizard header */}
        <div className="lg:hidden flex flex-col gap-4">
          {mstep < 5 && stock && (
            <div aria-label="Gift preview">
              <GiftCard
                variant="compact"
                symbol={stock.symbol}
                name={stock.name}
                logo={stock.logo}
                usd={usd}
                tokens={ui}
                status={cardStatus}
                date={openDate ? fmtShortIn(openDate, zone) : undefined}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            {mstep > 1 && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => setMstep((s) => s - 1)}
                className="size-11 -ml-2 rounded-xl flex items-center justify-center hover:bg-surface-2"
              >
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
            )}
            <div className="grow flex flex-col gap-2">
              <div className="flex justify-between text-[13px] text-muted">
                <span>Step {mstep} of 5</span>
                <span>{STEPS[mstep - 1]}</span>
              </div>
              <div aria-hidden="true" className="grid grid-cols-5 gap-1.5">
                {STEPS.map((_, i) => (
                  <span key={i} className={`h-1 rounded-sm ${i < mstep ? "bg-accent" : "bg-line"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex flex-col gap-2 pb-3">
          <h1 className="m-0 text-[44px] font-semibold tracking-[-0.03em] leading-[1.05]">Send a piece of the future.</h1>
          <p className="m-0 text-[17px] text-muted">Gift pre-IPO stock exposure as a link. They claim it in one tap.</p>
        </div>

        <Section
          id="s1"
          n={1}
          title="Choose a company"
          className={only(1)}
          aside={
            <label className="relative flex items-center w-full sm:w-[260px]">
              <span className="sr-only">Search companies</span>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="absolute left-3 text-faint">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input
                type="search"
                placeholder="Search companies"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full h-11 pl-[38px] pr-3 rounded-xl border border-line bg-field text-sm placeholder:text-faint"
              />
            </label>
          }
        >
          {stocksError && <Notice tone="error">{stocksError}</Notice>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {!stocks &&
              !stocksError &&
              Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="p-3.5 rounded-[14px] border border-line flex flex-col gap-3" aria-hidden="true">
                  <div className="flex items-center gap-2.5">
                    <span className="pg-sk size-9 rounded-[10px]" />
                    <span className="pg-sk h-3.5 w-16 rounded-md" />
                  </div>
                  <span className="pg-sk h-3.5 w-[72px] rounded-md" />
                </div>
              ))}
            {tiles.map((s) => {
              const sel = s.symbol === stock?.symbol;
              return (
                <button
                  key={s.symbol}
                  type="button"
                  aria-pressed={sel}
                  disabled={busy}
                  onClick={() => setSymbol(s.symbol)}
                  className={`relative text-left p-3.5 rounded-[14px] border flex flex-col gap-3 transition-colors ${
                    sel ? "border-accent shadow-[inset_0_0_0_1px_var(--accent)] bg-accent-soft" : "border-line bg-surface hover:border-faint"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <StockTile symbol={s.symbol} logo={s.logo} size={36} />
                    <span className="flex flex-col min-w-0">
                      <span className="text-[14.5px] font-semibold truncate">{s.name}</span>
                      <span className="text-[11.5px] text-faint font-mono">{s.symbol}</span>
                    </span>
                  </div>
                  <span className="text-[13px] text-ink-2">
                    {formatUsd(s.tokenPrice)} <span className="text-faint">/ token</span>
                  </span>
                  {sel && (
                    <span aria-hidden="true" className="absolute top-2.5 right-2.5 size-5 rounded-full bg-accent flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d={ICON.check} />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {stocks && tiles.length === 0 && (
            <p className="m-0 text-sm text-muted">No companies match “{q}”. Try OpenAI or Anthropic.</p>
          )}
        </Section>

        <Section id="s2" n={2} title="How much?" className={only(2)}>
          <div className="flex flex-col lg:flex-row items-center lg:items-end justify-between gap-x-6 gap-y-3">
            <div className="flex flex-col items-center lg:items-start gap-1.5">
              <label className={`flex items-baseline gap-0.5 border-b-2 pb-1.5 min-w-[220px] ${amountError ? "border-red-line" : "border-line"}`}>
                <span className="text-[56px] lg:text-[44px] font-semibold text-faint">$</span>
                <span className="sr-only">Amount in US dollars</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  disabled={busy}
                  aria-invalid={!!amountError}
                  aria-describedby="feeLine"
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-[180px] lg:w-[200px] border-0 bg-transparent text-[56px] lg:text-[44px] font-semibold tracking-[-0.03em] p-0 outline-offset-[6px]"
                />
              </label>
              <span className="font-mono text-[15px] text-ink-2">
                ≈ {formatTokens(ui)} {stock?.symbol ?? ""}
              </span>
            </div>
            <div className="relative flex items-center gap-1.5 pb-1">
              <span id="feeLine" className="text-[13px] lg:text-sm text-ink-2">
                Recipient receives <strong className="font-semibold text-ink">≈ {mintInfo ? formatUsd(netUsd) : "…"}</strong> after network token fees
              </span>
              <button
                type="button"
                aria-label="Why is there a fee?"
                aria-expanded={tip}
                aria-controls="feeTip"
                onClick={() => setTip((t) => !t)}
                onMouseEnter={() => setTip(true)}
                onMouseLeave={() => setTip(false)}
                onBlur={() => setTip(false)}
                className="size-8 shrink-0 rounded-full text-muted flex items-center justify-center hover:bg-surface-2"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
              </button>
              {tip && (
                <div id="feeTip" role="tooltip" className="absolute right-0 bottom-11 w-[300px] max-w-[85vw] px-3.5 py-3 rounded-xl bg-ink text-ground text-[13px] leading-[1.45] shadow-[0_12px_30px_-10px_rgba(22,23,26,0.45)] z-10">
                  PreStock tokens charge a small fee every time they move, set by the token itself
                  {mintInfo ? ` (currently ${mintInfo.feeBps / 100}%)` : ""}. Your gift moves twice: into its gift wallet, then to whoever claims it.
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div role="group" aria-label="Quick amounts" className="grid grid-cols-4 lg:flex gap-2">
              {QUICK.map((v) => {
                const sel = usd === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={sel}
                    disabled={busy}
                    onClick={() => setAmount(String(v))}
                    className={`h-11 lg:min-w-16 px-4 rounded-full border text-sm font-semibold ${
                      sel ? "border-ink bg-ink text-ground" : "border-line bg-surface hover:border-faint"
                    }`}
                  >
                    ${v}
                  </button>
                );
              })}
            </div>
            {publicKey && balances && stock && (
              <span className="text-[13px] text-muted text-center">
                Balance: {formatUsd(heldUsd)} of {stock.name}
              </span>
            )}
          </div>
          {amountError && usd > 0 && !insufficient && <ErrorLine>{amountError}</ErrorLine>}
          {insufficient && usd >= 1 && stock && (
            <div id="err" role="alert" className="flex flex-col gap-3 px-3.5 lg:px-4 py-3.5 rounded-[14px] bg-red-bg text-red text-sm">
              <div className="flex gap-2.5 leading-[1.4]">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                <span>
                  {heldRaw === 0n ? (
                    <>You don&apos;t hold any {stock.name} in this wallet yet.</>
                  ) : (
                    <>
                      You have <strong className="font-semibold">{formatUsd(heldUsd)}</strong> of {stock.name} in this wallet. Lower the
                      amount to continue.
                    </>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-2 lg:pl-7">
                {maxUsd >= 1 && (
                  <button
                    type="button"
                    onClick={() => setAmount(maxUsd.toFixed(2))}
                    className="h-11 lg:h-10 px-3.5 rounded-xl lg:rounded-[10px] border border-red-line/40 bg-surface text-ink text-sm lg:text-[13.5px] font-semibold whitespace-nowrap"
                  >
                    Use max · {formatUsd(maxUsd)}
                  </button>
                )}
                <a
                  href={stock.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`h-11 lg:h-10 px-3.5 rounded-xl lg:rounded-[10px] border border-red-line/40 bg-surface text-ink text-sm lg:text-[13.5px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    maxUsd >= 1 ? "" : "col-span-2"
                  }`}
                >
                  Get {stock.name} tokens
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
                  </svg>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                <button
                  type="button"
                  onClick={() => setBalanceCheck((n) => n + 1)}
                  disabled={refreshing}
                  aria-busy={refreshing}
                  className="col-span-2 h-11 lg:h-10 px-3 rounded-[10px] text-ink text-sm lg:text-[13.5px] font-semibold flex items-center justify-center gap-1.5"
                >
                  {refreshing ? (
                    <Spinner size={15} />
                  ) : (
                    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5" />
                    </svg>
                  )}
                  {refreshing ? "Checking your wallet…" : "I've got them, refresh balance"}
                </button>
              </div>
            </div>
          )}
          {solError && <ErrorLine>{solError}</ErrorLine>}
          {mintError && <ErrorLine>{mintError}</ErrorLine>}
        </Section>

        <Section id="s3" n={3} title="When can it be opened?" optional className={only(3)}>
          <div role="radiogroup" aria-label="When the gift can be opened" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(
              [
                { k: "now", label: "Right away", sub: "Can be opened right away" },
                { k: "lock", label: "Lock until…", sub: "Pick a date and time" },
              ] as const
            ).map((m) => {
              const sel = mode === m.k;
              return (
                <button
                  key={m.k}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  disabled={busy}
                  onClick={() => pickMode(m.k)}
                  className={`text-left px-4 py-3.5 rounded-[14px] border flex items-center gap-3 ${
                    sel ? "border-accent shadow-[inset_0_0_0_1px_var(--accent)] bg-accent-soft" : "border-line bg-surface hover:border-faint"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-5 shrink-0 rounded-full ${sel ? "border-[6px] border-accent" : "border-[1.5px] border-radio-off"}`}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[14.5px] font-semibold">{m.label}</span>
                    <span className="text-[13px] text-muted">{m.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {locked && (
            <div className="flex flex-col gap-3.5 p-4 rounded-[14px] bg-ground">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <span>
                    Time zone<span className="lg:hidden"> · pick theirs</span>
                  </span>
                  <select
                    value={tz}
                    disabled={busy}
                    onChange={(e) => changeZone(e.target.value)}
                    className="h-10 px-2.5 rounded-[10px] border border-line bg-surface text-sm text-ink"
                  >
                    {TIME_ZONES.map((z) => (
                      <option key={z.value} value={z.value}>
                        {z.value === "local"
                          ? `Your local time (${tzNameIn(new Date(now), myZone)})`
                          : `${z.label} · ${tzNameIn(new Date(unlockAt ?? now), z.value)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="hidden lg:inline text-[13px] text-muted">Pick theirs so it opens at the right moment for them.</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(
                  [
                    ["1w", "1 week"],
                    ["1m", "1 month"],
                    ["custom", "Custom date"],
                  ] as const
                ).map(([k, label]) => {
                  const sel = preset === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={sel}
                      disabled={busy}
                      onClick={() => pickPreset(k)}
                      className={`h-10 px-3.5 rounded-full border text-[13.5px] font-semibold ${
                        sel ? "border-ink bg-ink text-ground" : "border-line bg-surface hover:border-faint"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                {preset === "custom" && (
                  <span className="flex flex-wrap items-center gap-2 lg:ml-1.5">
                    <label className="flex items-center gap-1.5 text-[13px] text-muted">
                      Date
                      <input
                        type="date"
                        value={customDate}
                        min={isoIn(now, zone).date}
                        max={latestUnlock ? isoIn(latestUnlock, zone).date : undefined}
                        disabled={busy}
                        onChange={(e) => e.target.value && setCustomDate(e.target.value)}
                        className="h-10 px-2.5 rounded-[10px] border border-line bg-surface text-sm text-ink"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[13px] text-muted">
                      Time ({zoneAbbr})
                      <input
                        type="time"
                        value={customTime}
                        disabled={busy}
                        onChange={(e) => e.target.value && setCustomTime(e.target.value)}
                        className="h-10 px-2.5 rounded-[10px] border border-line bg-surface text-sm text-ink"
                      />
                    </label>
                  </span>
                )}
              </div>
              {preset === "custom" && tz !== "local" && (
                <p className="m-0 -mt-1.5 text-[12.5px] text-muted">
                  Enter the date and time as the clock reads in {zoneLabel}.
                </p>
              )}
              {openDate && !lockError && (
                <div className="flex flex-col gap-1">
                  <div className="text-[15px] font-semibold">
                    Opens {fmtDayIn(openDate, zone, true)} at {fmtTimeIn(openDate, zone)} {tzNameIn(openDate, zone)}
                  </div>
                  {localNote && <div className="text-[13px] text-muted">{localNote}</div>}
                </div>
              )}
              {lockError && <ErrorLine>{lockError}</ErrorLine>}
              {deadline && latestUnlock && (
                <div role="note" className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-amber-bg text-amber-ink text-[13.5px] leading-[1.45]">
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
                    <path d="M12 4l9 16H3z" />
                    <path d="M12 10v4M12 17h.01" />
                  </svg>
                  <span>
                    {stock?.name} has announced a conversion deadline of {fmtDayIn(deadline, zone)}. To leave at least a week to claim, the
                    latest opening date is {fmtDayIn(new Date(latestUnlock), zone)}.{capped ? " We moved your date to fit." : ""}
                  </span>
                </div>
              )}
              <div className="flex gap-2.5 text-[13.5px] text-ink-2 leading-[1.45]">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
                  <path d={ICON.lock} />
                </svg>
                <span>Nobody, including us, can open it before this time. You can still take it back.</span>
              </div>
            </div>
          )}
        </Section>

        <Section id="s4" n={4} title="Add a message" optional className={only(4)}>
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Message</span>
            <textarea
              rows={2}
              maxLength={MESSAGE_MAX}
              value={message}
              disabled={busy}
              onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder="Happy birthday! Hold this one till it lands."
              className="resize-none px-4 py-3.5 rounded-[14px] border border-line bg-field font-serif italic text-xl leading-[1.3] placeholder:text-faint"
            />
            <span className="flex justify-between gap-4 text-xs text-faint">
              <span>Shows on the card and the link preview.</span>
              <span>
                {message.length} / {MESSAGE_MAX}
              </span>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">
              From <span className="font-normal text-faint">optional</span>
            </span>
            <input
              value={from}
              maxLength={FROM_MAX}
              disabled={busy}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Your name, as they know you"
              className="h-12 px-3.5 rounded-xl border border-line bg-field text-[15px] placeholder:text-faint"
            />
          </label>
        </Section>
      </div>

      <aside aria-label="Review your gift" className={`${mstep === 5 ? "flex" : "hidden"} lg:flex flex-col gap-5 lg:sticky lg:top-6`}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-[0.06em] uppercase text-muted">Review</span>
          <span className="text-[13px] text-muted">What they&apos;ll see</span>
        </div>
        {stock ? (
          <div style={{ boxShadow: "var(--card-ring)" }} className="rounded-[22px]">
            <GiftCard
              symbol={stock.symbol}
              name={stock.name}
              logo={stock.logo}
              usd={usd}
              tokens={ui}
              message={message}
              from={from}
              status={cardStatus}
              date={openDate ? fmtShortIn(openDate, zone) : undefined}
            />
          </div>
        ) : (
          <div className="pg-sk w-full aspect-[400/252] rounded-[22px]" aria-hidden="true" />
        )}
        <div className="bg-surface border border-line rounded-[20px] px-5 py-2">
          <dl className="m-0 flex flex-col text-sm">
            <Row label="You send">
              {formatUsd(usd)} · <span className="font-mono">{formatTokens(ui)} {stock?.symbol}</span>
            </Row>
            <Row label="They receive" strong>
              {mintInfo ? `≈ ${formatUsd(netUsd)} of ${stock?.name}` : "…"}
            </Row>
            <Row label="Can be opened">
              {locked && opensLabel ? opensLabel : "Right away"}
            </Row>
            <Row label="Network fee" last>
              &lt; $0.01
            </Row>
          </dl>
        </div>

        {txError && <Notice tone="error">{txError}</Notice>}

        {!publicKey ? (
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="h-14 rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-base font-semibold"
          >
            Connect wallet to send
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSubmit}
            aria-busy={busy}
            onClick={create}
            className="h-14 rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-base font-semibold flex items-center justify-center gap-2 disabled:bg-disabled disabled:text-on-disabled disabled:cursor-not-allowed aria-busy:opacity-70"
          >
            {phase === "locking" && (
              <>
                <Spinner /> Locking your gift…
              </>
            )}
            {phase === "signing" && (
              <>
                <Spinner /> Confirm in your wallet…
              </>
            )}
            {phase === "confirming" && (
              <>
                <Spinner /> Creating your gift…
              </>
            )}
            {phase === "form" && (
              <>
                <span className="lg:hidden">Sign and create gift</span>
                <span className="hidden lg:inline">Review and sign</span>
              </>
            )}
          </button>
        )}
        {publicKey && !canSubmit && !busy && (amountError || solError || lockError) && (
          <p className="m-0 -mt-2 text-center text-[13px] text-red">{amountError ?? solError ?? lockError}</p>
        )}
        <p className="m-0 text-center text-[13px] text-muted">You&apos;ll confirm in your wallet. Nothing is sent until you sign.</p>
        <ul className="m-0 px-[18px] py-4 list-none rounded-2xl bg-surface-2 flex flex-col gap-2.5 text-[13.5px] leading-[1.4] text-ink-2">
          <Bullet icon="M3.5 8.5a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5zM16 12.5h4.5M3.5 9.5h17">
            No smart contract. Your gift sits in its own wallet until someone claims it.
          </Bullet>
          <Bullet icon={ICON.lock}>Locked gifts can&apos;t be opened early by anyone, including us.</Bullet>
          <Bullet icon={ICON.back}>You can always take back a gift that hasn&apos;t been claimed.</Bullet>
        </ul>
      </aside>

      {/* Mobile wizard footer */}
      {mstep < 5 && (
        <div className="lg:hidden fixed left-0 right-0 bottom-0 z-20 px-4 pt-3 pb-6 bg-ground border-t border-line flex gap-2">
          {mstep === 4 && (
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setMstep(5);
              }}
              className="h-[52px] px-5 rounded-[14px] border border-line bg-surface text-base font-semibold"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            disabled={!stepOk[mstep]}
            onClick={() => setMstep((s) => s + 1)}
            className="grow h-[52px] rounded-[14px] bg-accent text-on-accent text-base font-semibold disabled:bg-disabled disabled:text-on-disabled"
          >
            {mstep === 1 && stock ? `Continue with ${stock.name}` : mstep === 4 ? "Review gift" : "Continue"}
          </button>
        </div>
      )}
    </main>
  );
}

function Section({
  id,
  n,
  title,
  optional,
  aside,
  className = "flex",
  children,
}: {
  id: string;
  n: number;
  title: string;
  optional?: boolean;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`${className} bg-surface border border-line rounded-[20px] px-4 sm:px-7 pt-5 sm:pt-6 pb-6 sm:pb-7 flex-col gap-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id={id} className="m-0 text-lg font-semibold tracking-[-0.01em] flex items-center gap-2.5">
          <span className="size-6 rounded-full bg-ink text-ground text-xs flex items-center justify-center">{n}</span>
          {title}
          {optional && <span className="text-sm font-normal text-faint">optional</span>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ErrorLine({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-red-bg text-red text-sm">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <span className="grow">{children}</span>
      {action}
    </div>
  );
}

function Row({ label, children, last, strong }: { label: string; children: React.ReactNode; last?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-3 ${last ? "" : "border-b border-line-soft"}`}>
      <dt className="text-muted">{label}</dt>
      <dd className={`m-0 text-right ${strong ? "font-semibold" : "font-medium"}`}>{children}</dd>
    </div>
  );
}

function Bullet({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink">
        <path d={icon} />
      </svg>
      {children}
    </li>
  );
}
