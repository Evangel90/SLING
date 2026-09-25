import { Buffer, defaultChainInfo, mainnetClient, roundAt, roundTime, timelockDecrypt, timelockEncrypt } from "tlock-js";
import bs58 from "bs58";

// drand quicknet: a new BLS-signed round every 3s. A ciphertext for round N can only be opened once
// the network publishes round N's signature, so nobody (including this app) can open a gift early.

let client: ReturnType<typeof mainnetClient> | null = null;
const drand = () => (client ??= mainnetClient());

// The browser Buffer polyfill (buffer@6, via tlock-js) has no "base64url" encoding, so convert by hand.
// Output is identical to Node's base64url, so links made on either side decode on both.
function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8");
}

export function roundFor(unlockAtMs: number): number {
  return roundAt(unlockAtMs, defaultChainInfo);
}

/** When the round a gift is locked to is published (ms). */
export function unlockTimeOf(round: number): number {
  return roundTime(defaultChainInfo, round);
}

/** Encrypts the 32-byte gift seed to the drand round at `unlockAtMs`. Returns URL-safe ciphertext. */
export async function lockSeed(seed: string, unlockAtMs: number): Promise<string> {
  const armored = await timelockEncrypt(roundFor(unlockAtMs), Buffer.from(bs58.decode(seed)), drand());
  return toBase64Url(armored);
}

export type UnlockResult = { kind: "open"; seed: string } | { kind: "early" } | { kind: "error"; message: string };

export async function unlockSeed(ciphertext: string): Promise<UnlockResult> {
  let armored: string;
  try {
    armored = fromBase64Url(ciphertext);
  } catch {
    return { kind: "error", message: "This gift link is damaged." };
  }
  try {
    const bytes = await timelockDecrypt(armored, drand());
    return { kind: "open", seed: bs58.encode(bytes) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/too early/i.test(message)) return { kind: "early" };
    if (/fetch|network|timeout|ECONN|ENOTFOUND|status/i.test(message)) {
      return { kind: "error", message: "Couldn't reach the time-lock network. Check your connection and try again." };
    }
    return { kind: "error", message: "This gift link is damaged or incomplete. Ask the sender to send it again." };
  }
}

export const LOCK_MIN_MS = 60_000;
export const LOCK_MAX_MS = 5 * 365 * 24 * 3600 * 1000;
