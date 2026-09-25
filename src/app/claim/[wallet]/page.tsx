import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { OpenGift } from "@/components/OpenGift";

export const metadata: Metadata = {
  title: "You've received a gift · SLING",
  description: "Someone sent you a piece of a company before it goes public. Claim it to your Solana wallet in one tap.",
};

export default async function ClaimPage({ params }: PageProps<"/claim/[wallet]">) {
  const { wallet } = await params;
  return (
    <>
      <Header minimal />
      <OpenGift wallet={wallet} mode="claim" />
    </>
  );
}
