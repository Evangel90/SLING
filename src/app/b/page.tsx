import type { Metadata } from "next";
import { headers } from "next/headers";
import { ForwardToClaim } from "@/components/ForwardToClaim";
import { giftPreview } from "@/lib/share";

// The shareable Blink link, on our own domain. Crawlers (X, iMessage, Slack) read the preview tags,
// Blink clients follow actions.json to /api/actions/claim, and people are forwarded to the claim page.
// The query string carries the gift secret, exactly like the Blink endpoint; never log it.

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ searchParams }: PageProps<"/b">): Promise<Metadata> {
  const q = await searchParams;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const u = Number(one(q.u));
  const fallback: Metadata = {
    title: "A gift for you · SLING",
    description: "Someone sent you a piece of a company before it goes public. Claim it on Solana in one tap.",
    robots: { index: false },
  };
  try {
    const p = await giftPreview(origin, one(q.w), {
      message: one(q.m),
      from: one(q.f),
      unlockAt: Number.isFinite(u) && u > 0 ? u * 1000 : null,
    });
    const images = p.image ? [{ url: p.image, width: 1200, height: 630, alt: p.title }] : [];
    return {
      title: `${p.title} · SLING`,
      description: p.description,
      robots: { index: false },
      openGraph: { title: p.title, description: p.description, images, siteName: "SLING", type: "website" },
      twitter: {
        card: p.image ? "summary_large_image" : "summary",
        title: p.title,
        description: p.description,
        images: p.image ? [p.image] : [],
      },
    };
  } catch {
    return fallback;
  }
}

export default function BlinkLinkPage() {
  return <ForwardToClaim />;
}
