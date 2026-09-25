import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { GiftsSent } from "@/components/GiftsSent";

export const metadata: Metadata = {
  title: "Gifts sent · SLING",
  robots: { index: false },
};

export default function SentPage() {
  return (
    <>
      <Header />
      <GiftsSent />
    </>
  );
}
