import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brandMark";

// iOS and many link-preview apps (WhatsApp, iMessage) use this when a page has no preview image.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // Square corners: iOS applies its own mask.
  return new ImageResponse(<BrandMark size={180} radius={0} />, size);
}
