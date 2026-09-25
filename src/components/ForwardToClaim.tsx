"use client";

import { useEffect, useSyncExternalStore } from "react";
import { claimUrl, type ClaimSecret } from "@/lib/gift";
import { LogoMark } from "./Header";

const noop = () => () => {};

/** Rebuilds the web claim link from a /b share link, moving the secret into the URL fragment. "" if invalid. */
function claimLinkFromShare(): string {
  return buildClaimLink() ?? "";
}

function buildClaimLink(): string | null {
  const q = new URLSearchParams(window.location.search);
  const wallet = q.get("w");
  const seed = q.get("k");
  const ciphertext = q.get("c");
  const u = Number(q.get("u"));
  if (!wallet) return null;
  let secret: ClaimSecret;
  if (seed) secret = { kind: "key", seed };
  else if (ciphertext && Number.isFinite(u) && u > 0) secret = { kind: "locked", ciphertext, unlockAt: u * 1000 };
  else return null;
  return claimUrl(window.location.origin, wallet, secret, { message: q.get("m") ?? "", from: q.get("f") ?? "" });
}

export function ForwardToClaim() {
  const target = useSyncExternalStore(noop, claimLinkFromShare, () => null);

  useEffect(() => {
    // replace(): the key-in-query share URL doesn't stay in this tab's history.
    if (target) window.location.replace(target);
  }, [target]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-5 px-4 py-24 text-center">
      <LogoMark size={40} />
      {target === "" ? (
        <p className="m-0 text-base text-muted">This gift link is incomplete. Ask the sender to share it again.</p>
      ) : (
        <>
          <p className="m-0 text-lg font-semibold">Opening your gift…</p>
          {target && (
            <a href={target} className="text-sm font-semibold text-link">
              Tap here if nothing happens
            </a>
          )}
        </>
      )}
    </main>
  );
}
