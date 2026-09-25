import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { OpenGift } from "@/components/OpenGift";

export const metadata: Metadata = {
  title: "Take back a gift · SLING",
  robots: { index: false },
};

export default async function RecoverPage({ params }: PageProps<"/recover/[wallet]">) {
  const { wallet } = await params;
  return (
    <>
      <Header />
      <OpenGift wallet={wallet} mode="recover" />
    </>
  );
}
