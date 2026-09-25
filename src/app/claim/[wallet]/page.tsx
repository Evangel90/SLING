import type { Metadata } from "next";
import { headers } from "next/headers";
import { Header } from "@/components/Header";
import { OpenGift } from "@/components/OpenGift";
import { giftPreview } from "@/lib/share";

const fallback: Metadata = {
  title: "You've received a gift · SLING",
  description: "Someone sent you a piece of a company before it goes public. Claim it to your Solana wallet in one tap.",
};

// Link previews (WhatsApp, iMessage, Slack) show the gift card. Built from the public gift wallet only:
// the key lives in the URL fragment, which never reaches the server.
export async function generateMetadata({ params, searchParams }: PageProps<"/claim/[wallet]">): Promise<Metadata> {
  const { wallet } = await params;
  const q = await searchParams;
  const u = Number(Array.isArray(q.u) ? q.u[0] : q.u);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  try {
    const p = await giftPreview(origin, wallet, { unlockAt: Number.isFinite(u) && u > 0 ? u * 1000 : null });
    if (!p.image) return fallback;
    const images = [{ url: p.image, width: 1200, height: 630, alt: p.title }];
    return {
      title: `${p.title} · SLING`,
      description: p.description,
      openGraph: { title: p.title, description: p.description, images },
      twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [p.image] },
    };
  } catch {
    return fallback;
  }
}

export default async function ClaimPage({ params }: PageProps<"/claim/[wallet]">) {
  const { wallet } = await params;
  return (
    <>
      <Header minimal />
      <OpenGift wallet={wallet} mode="claim" />
    </>
  );
}
