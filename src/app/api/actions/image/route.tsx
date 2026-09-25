import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brandFor } from "@/lib/prestocks";

// Share image for Blinks. Receives only public gift details, never the gift key.

const fontDir = join(process.cwd(), "assets/fonts");
const fonts = Promise.all([
  readFile(join(fontDir, "Geist-SemiBold.ttf")),
  readFile(join(fontDir, "Geist-Regular.ttf")),
  readFile(join(fontDir, "GeistMono-Medium.ttf")),
  readFile(join(fontDir, "InstrumentSerif-Italic.ttf")),
]);

const ICON = {
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z",
  gift: "M4.5 10h15v4h-15zM6 14v6h12v-6M12 10v10M12 10c-1.4-3.6-6-4-6-1.6S10 10 12 10zm0 0c1.4-3.6 6-4 6-1.6S14 10 12 10z",
  done: "M8 12h8M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0",
};

const PILL = {
  locked: { label: "Locked", bg: "#FDF1DC", fg: "#7A4800", icon: ICON.lock, cfg: "#FFCB7A", cbg: "rgba(255,203,122,0.13)" },
  claimable: { label: "Ready to claim", bg: "#E3F3E9", fg: "#125C33", icon: ICON.gift, cfg: "#8BE6B0", cbg: "rgba(139,230,176,0.13)" },
  gone: { label: "Claimed or taken back", bg: "#E2E0DA", fg: "#3A3C42", icon: ICON.done, cfg: "#DADCE0", cbg: "rgba(255,255,255,0.09)" },
};


export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const symbol = (q.get("s") ?? "OPENAI").slice(0, 16);
  const name = (q.get("n") ?? symbol).slice(0, 24);
  const usd = Math.max(0, Number(q.get("usd")) || 0);
  const tokens = Math.max(0, Number(q.get("t")) || 0);
  const message = (q.get("m") ?? "").slice(0, 140);
  const from = (q.get("f") ?? "").slice(0, 32) || "A friend";
  const stParam = q.get("st");
  const st = stParam === "gone" || stParam === "locked" ? stParam : "claimable";
  const date = (q.get("d") ?? "").slice(0, 16);
  // "wide" (1200×630) is for link previews like X cards, which crop to ~1.91:1. Default is the 1:1 Blink image.
  const wide = q.get("layout") === "wide";
  const S = wide ? 1.35 : 1.85; // card drawn at the design's 400×252, scaled

  const b = brandFor(symbol);
  const chipLabel = st === "locked" && date ? `Opens ${date}` : PILL[st].label;
  const pill = {
    ...PILL[st],
    label: st === "locked" && date ? `Opens ${date}` : st === "claimable" && wide ? "Tap to claim" : PILL[st].label,
  };
  const muted = st === "gone";
  const cardBg = muted ? "#1B1C1F" : b.card;
  const [dollars, cents] = usd.toFixed(2).split(".");
  const dollarsStr = `$${Number(dollars).toLocaleString("en-US")}`;
  const unknownAmount = muted && usd === 0;
  const headline = unknownAmount ? `This ${name} gift` : `${dollarsStr}${cents === "00" ? "" : "." + cents} of ${name}${muted ? "" : " for you"}`;
  const [semibold, regular, mono, serif] = await fonts;

  const headlineEl = (
        <div
          style={{
            fontSize: wide ? 76 : 92,
            fontWeight: 600,
            letterSpacing: "-0.045em",
            lineHeight: 0.98,
            textAlign: wide ? "left" : "center",
            color: muted ? "#5E6068" : "#16171A",
            display: "flex",
            justifyContent: wide ? "flex-start" : "center",
          }}
        >
          {headline}
        </div>
  );
  const cardEl = (
        <div
          style={{
            width: 400 * S,
            height: 252 * S,
            transform: "rotate(-2deg)",
            borderRadius: 22 * S,
            background: cardBg,
            color: "#FFFFFF",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: `${20 * S}px ${22 * S}px ${18 * S}px`,
            boxShadow: "0 40px 80px -40px rgba(15,16,19,0.6)",
          }}
        >
          <svg width={300 * S} height={252 * S} viewBox="0 0 300 252" style={{ position: "absolute", right: 0, top: 0 }}>
            {Array.from({ length: 16 }, (_, i) => (
              <circle key={i} cx="300" cy="0" r={72 + i * 14} fill="none" stroke={muted ? "#8A8C93" : b.tint} strokeOpacity="0.24" strokeWidth="0.8" />
            ))}
          </svg>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 * S }}>
              <div
                style={{
                  width: 40 * S,
                  height: 40 * S,
                  borderRadius: 12 * S,
                  background: muted ? "#3A3B40" : b.tile,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13 * S,
                  fontWeight: 600,
                }}
              >
                {b.mono}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 17 * S, fontWeight: 600, letterSpacing: "-0.015em" }}>{name}</div>
                <div style={{ fontFamily: "Geist Mono", fontSize: 11 * S, color: "rgba(255,255,255,0.64)" }}>{`PRE-IPO · ${symbol}`}</div>
              </div>
            </div>
            <div
              style={{
                height: 28 * S,
                padding: `0 ${11 * S}px 0 ${9 * S}px`,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                gap: 6 * S,
                fontSize: 12.5 * S,
                fontWeight: 600,
                color: pill.cfg,
                background: pill.cbg,
              }}
            >
              <svg width={13 * S} height={13 * S} viewBox="0 0 24 24" fill="none" stroke={pill.cfg} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d={pill.icon} />
              </svg>
              {chipLabel}
            </div>
          </div>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 3 * S, opacity: muted ? 0.72 : 1 }}>
            {unknownAmount ? (
              <span style={{ fontSize: 44 * S, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>Opened</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 * S }}>
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <span style={{ fontSize: 54 * S, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1 }}>{dollarsStr}</span>
                  <span style={{ fontSize: 26 * S, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>{`.${cents}`}</span>
                </div>
                <div style={{ fontFamily: "Geist Mono", fontSize: 12.5 * S, color: "rgba(255,255,255,0.68)" }}>
                  {`${tokens.toFixed(4)} ${symbol}`}
                </div>
              </div>
            )}
          </div>
          <div
            style={{
              marginTop: 14 * S,
              fontFamily: "Instrument Serif",
              fontStyle: "italic",
              fontSize: 19 * S,
              lineHeight: 1.18,
              color: "rgba(255,255,255,0.94)",
              opacity: message ? 1 : 0.5,
              display: "flex",
              maxHeight: 19 * S * 1.18 * 2,
              overflow: "hidden",
            }}
          >
            {message || "A gift for you"}
          </div>
          <div style={{ marginTop: 8 * S, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 * S, color: "rgba(255,255,255,0.68)" }}>
            <span>{`— ${from}`}</span>
            <span style={{ fontSize: 11 * S, fontWeight: 600, letterSpacing: "0.16em", color: "rgba(255,255,255,0.55)" }}>SLING</span>
          </div>
        </div>
  );
  const pillEl = (
          <div
            style={{
              height: wide ? 60 : 64,
              padding: wide ? "0 24px" : "0 26px",
              borderRadius: 999,
              background: pill.bg,
              color: pill.fg,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: wide ? 28 : 30,
              fontWeight: 600,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={pill.fg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={pill.icon} />
            </svg>
            {pill.label}
          </div>
  );
  const brandEl = (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg width={wide ? 40 : 44} height={wide ? 40 : 44} viewBox="0 0 28 28">
              <rect width="28" height="28" rx="8" fill="#16171A" />
              <path d="M14 11.2c-1.4-3.2-5.4-3.6-5.4-1.4s3.6 1.4 5.4 1.4zm0 0c1.4-3.2 5.4-3.6 5.4-1.4s-3.6 1.4-5.4 1.4z" stroke="#FFFFFF" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
              <rect x="7.5" y="11.2" width="13" height="9.3" rx="2" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
              <path d="M14 11.2v9.3" stroke="#FFFFFF" strokeWidth="1.5" />
            </svg>
            <span style={{ fontSize: wide ? 28 : 32, fontWeight: 600, letterSpacing: "0.16em" }}>SLING</span>
          </div>
  );
  const footerEl = (
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {pillEl}
          {brandEl}
        </div>
  );

  return new ImageResponse(
    wide ? (
      <div
        style={{
          width: 1200,
          height: 630,
          padding: "64px 72px",
          background: "#EFEDE8",
          color: "#16171A",
          fontFamily: "Geist",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 48,
        }}
      >
        <div style={{ width: 468, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start" }}>
          {brandEl}
          {headlineEl}
          {pillEl}
        </div>
        {cardEl}
      </div>
    ) : (
      <div
        style={{
          width: 1080,
          height: 1080,
          padding: "80px 90px 72px",
          background: "#EFEDE8",
          color: "#16171A",
          fontFamily: "Geist",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {headlineEl}
        {cardEl}
        {footerEl}
      </div>
    ),
    {
      width: wide ? 1200 : 1080,
      height: wide ? 630 : 1080,
      fonts: [
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 500, style: "normal" },
        { name: "Instrument Serif", data: serif, weight: 400, style: "italic" },
      ],
      headers: { "cache-control": "public, max-age=300" },
    },
  );
}
