import Image from "next/image";
import { brandFor } from "@/lib/prestocks";

export type CardStatus = "claimable" | "locked" | "unlocked" | "claimed" | "takenback" | "gone";

export const ICON = {
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z",
  unlock: "M7 11V8a5 5 0 0 1 9.6-2M5.5 11h13v9h-13z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  gift: "M4.5 10h15v4h-15zM6 14v6h12v-6M12 10v10M12 10c-1.4-3.6-6-4-6-1.6S10 10 12 10zm0 0c1.4-3.6 6-4 6-1.6S14 10 12 10z",
  back: "M9 7L5 11l4 4M5 11h9a5 5 0 0 1 0 10h-2",
  done: "M8 12h8M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0",
};

const GREEN = { fg: "#8BE6B0", bg: "rgba(139,230,176,0.13)", ring: "rgba(139,230,176,0.22)" };
const NEUTRAL = { fg: "#DADCE0", bg: "rgba(255,255,255,0.09)", ring: "rgba(255,255,255,0.14)" };

const STATUS: Record<CardStatus, { label: string; fg: string; bg: string; ring: string; icon: string }> = {
  claimable: { ...GREEN, label: "Ready to claim", icon: ICON.gift },
  unlocked: { ...GREEN, label: "Unlocked", icon: ICON.unlock },
  locked: { fg: "#FFCB7A", bg: "rgba(255,203,122,0.13)", ring: "rgba(255,203,122,0.24)", label: "Opens", icon: ICON.lock },
  claimed: { ...NEUTRAL, label: "Claimed", icon: ICON.check },
  takenback: { ...NEUTRAL, label: "Taken back", icon: ICON.back },
  gone: { ...NEUTRAL, label: "Claimed or taken back", icon: ICON.done },
};

export type GiftCardProps = {
  symbol: string;
  name: string;
  logo?: string;
  usd: number;
  tokens: number;
  message?: string;
  from?: string;
  status: CardStatus;
  /** Shown after "Opens" on locked cards. */
  date?: string;
  variant?: "full" | "compact";
};

export function StockTile({ symbol, logo, size, muted }: { symbol: string; logo?: string; size: number; muted?: boolean }) {
  const b = brandFor(symbol);
  return (
    <div
      aria-hidden="true"
      className="shrink-0 rounded-xl flex items-center justify-center text-[13px] font-bold tracking-wide overflow-hidden text-white"
      style={{
        width: size,
        height: size,
        background: muted ? "#3A3B40" : b.tile,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
      }}
    >
      {logo ? (
        <Image src={logo} alt="" width={size} height={size} className="size-full object-cover" style={{ filter: muted ? "grayscale(1)" : undefined }} />
      ) : (
        b.mono
      )}
    </div>
  );
}

function StatusChip({ status, date }: { status: CardStatus; date?: string }) {
  const s = STATUS[status];
  return (
    <div
      className="h-7 shrink-0 pl-[9px] pr-[11px] rounded-full flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap"
      style={{ color: s.fg, background: s.bg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
    >
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d={s.icon} />
      </svg>
      <span>{status === "locked" && date ? `Opens ${date}` : s.label}</span>
    </div>
  );
}

function Rings({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 300 252" fill="none" stroke={color} strokeOpacity="0.24" strokeWidth="0.8" className="absolute right-0 top-0 h-full">
      {Array.from({ length: 16 }, (_, i) => (
        <circle key={i} cx="300" cy="0" r={72 + i * 14} />
      ))}
    </svg>
  );
}

export function GiftCard(p: GiftCardProps) {
  const b = brandFor(p.symbol);
  const muted = p.status === "gone" || p.status === "takenback";
  const bg = muted ? "#1B1C1F" : b.card;
  const [dollars, cents] = p.usd.toFixed(2).split(".");
  const dollarsStr = `$${Number(dollars).toLocaleString("en-US")}`;
  const tokensStr = `${p.tokens.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${p.symbol}`;
  const msg = p.message?.trim();
  const sender = p.from?.trim() || "A friend";
  const chip = p.status === "locked" && p.date ? `Opens ${p.date}` : STATUS[p.status].label;
  const a11y = `Gift from ${sender}: ${dollarsStr}.${cents} of ${p.name} (${tokensStr}). ${chip}.`;
  const shadow = "0 22px 44px -22px rgba(15,16,19,0.6), 0 2px 6px rgba(15,16,19,0.16)";
  const innerRing = "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.07)";

  if (p.variant === "compact") {
    return (
      <div role="group" aria-label={a11y} className="relative w-full h-[92px] overflow-hidden rounded-[18px] text-white" style={{ background: bg, boxShadow: shadow }}>
        <Rings color={muted ? "#8A8C93" : b.tint} />
        <div aria-hidden="true" className="absolute inset-0 rounded-[18px] pointer-events-none" style={{ boxShadow: innerRing }} />
        <div className="relative h-full pl-3.5 pr-4 flex items-center gap-3">
          <StockTile symbol={p.symbol} logo={p.logo} size={44} muted={muted} />
          <div className="grow min-w-0 flex flex-col gap-0.5" style={{ opacity: muted ? 0.72 : 1 }}>
            <div className="text-lg font-semibold tracking-[-0.02em] truncate">
              {dollarsStr}.{cents} of {p.name}
            </div>
            <div className="font-mono text-xs text-white/70">{tokensStr}</div>
          </div>
          <StatusChip status={p.status} date={p.date} />
        </div>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={a11y}
      className="relative w-full aspect-[400/252] overflow-hidden rounded-[22px] text-white @container"
      style={{ background: bg, boxShadow: shadow }}
    >
      <Rings color={muted ? "#8A8C93" : b.tint} />
      <div aria-hidden="true" className="absolute inset-0 rounded-[22px] pointer-events-none" style={{ boxShadow: innerRing }} />

      <div className="relative h-full flex flex-col px-[5.5cqw] pt-[5cqw] pb-[4.5cqw]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-[2.75cqw] min-w-0">
            <StockTile symbol={p.symbol} logo={p.logo} size={40} muted={muted} />
            <div className="flex flex-col min-w-0">
              <div className="text-[4.25cqw] font-semibold tracking-tight whitespace-nowrap">{p.name}</div>
              <div className="font-mono text-[2.75cqw] tracking-wide text-white/65">PRE-IPO · {p.symbol}</div>
            </div>
          </div>
          <StatusChip status={p.status} date={p.date} />
        </div>

        <div className="mt-auto flex flex-col gap-[0.75cqw]" style={{ opacity: muted ? 0.72 : 1 }}>
          <div className="flex items-baseline leading-none">
            <span className="text-[13.5cqw] font-semibold tracking-[-0.04em]">{dollarsStr}</span>
            <span className="text-[6.5cqw] font-semibold tracking-tight text-white/55">.{cents}</span>
          </div>
          <div className="font-mono text-[3.1cqw] text-white/70">{tokensStr}</div>
        </div>

        <div className="mt-[3.5cqw] font-serif italic text-[4.75cqw] leading-[1.18] text-white/95 line-clamp-2" style={{ opacity: msg ? 1 : 0.5 }}>
          {msg || "Add a message…"}
        </div>
        <div className="mt-[2cqw] flex items-center justify-between gap-3">
          <span className="text-[3.1cqw] text-white/70">— {sender}</span>
          <span className="flex items-center gap-[1.25cqw] text-[2.75cqw] font-bold tracking-[0.16em] text-white/55">
            <svg aria-hidden="true" className="size-[3.25cqw]" viewBox="0 0 28 28">
              <rect width="28" height="28" rx="8" fill="rgba(255,255,255,0.55)" />
              <path d="M14 11.2c-1.4-3.2-5.4-3.6-5.4-1.4s3.6 1.4 5.4 1.4zm0 0c1.4-3.2 5.4-3.6 5.4-1.4s-3.6 1.4-5.4 1.4z" stroke={bg} strokeWidth="2" fill="none" strokeLinejoin="round" />
              <rect x="7.5" y="11.2" width="13" height="9.3" rx="2" stroke={bg} strokeWidth="2" fill="none" />
              <path d="M14 11.2v9.3" stroke={bg} strokeWidth="2" />
            </svg>
            SLING
          </span>
        </div>
      </div>
    </div>
  );
}
