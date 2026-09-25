import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BrandMark } from "@/lib/brandMark";

// Default link preview (home, Gifts sent, recovery pages). Claim and /b links override it with the gift card.
export const alt = "SLING: send a piece of the future";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontDir = join(process.cwd(), "assets/fonts");
const fonts = Promise.all([
  readFile(join(fontDir, "Geist-SemiBold.ttf")),
  readFile(join(fontDir, "Geist-Regular.ttf")),
  readFile(join(fontDir, "InstrumentSerif-Italic.ttf")),
]);

export default async function OpengraphImage() {
  const [semibold, regular, serif] = await fonts;
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          padding: "72px 80px",
          background: "#EFEDE8",
          color: "#16171A",
          fontFamily: "Geist",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BrandMark size={64} />
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "0.16em" }}>SLING</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1 }}>Send a piece of the future.</div>
          <div style={{ fontSize: 34, color: "#45474D" }}>Gift pre-IPO stock exposure as a link. They claim it in one tap.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "Instrument Serif", fontStyle: "italic", fontSize: 34, color: "#5E6068" }}>
            OpenAI · Anthropic · Anduril · Neuralink · and more
          </span>
          <span style={{ fontSize: 26, color: "#5E6068" }}>On Solana</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Instrument Serif", data: serif, weight: 400, style: "italic" },
      ],
    },
  );
}
