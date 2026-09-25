"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortAddr } from "@/lib/gift";
import { ThemeToggle } from "./ThemeToggle";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 28 28">
      <rect width="28" height="28" rx="8" fill="var(--ink)" />
      <path
        d="M14 11.2c-1.4-3.2-5.4-3.6-5.4-1.4s3.6 1.4 5.4 1.4zm0 0c1.4-3.2 5.4-3.6 5.4-1.4s-3.6 1.4-5.4 1.4z"
        stroke="var(--ground)"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      <rect x="7.5" y="11.2" width="13" height="9.3" rx="2" stroke="var(--ground)" strokeWidth="1.5" fill="none" />
      <path d="M14 11.2v9.3" stroke="var(--ground)" strokeWidth="1.5" />
    </svg>
  );
}

export function Wordmark() {
  return <span className="text-[15px] sm:text-[17px] font-bold tracking-[0.16em]">SLING</span>;
}

export function WalletButton() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!publicKey) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="h-11 px-4 rounded-xl border border-line bg-surface text-sm font-semibold hover:border-faint"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-11 px-3 rounded-xl border border-line bg-surface flex items-center gap-2.5"
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-dot" />
        <span className="font-mono text-[13px]">{shortAddr(publicKey.toBase58())}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-48 rounded-xl border border-line bg-surface p-1 shadow-lg z-20">
          <button
            role="menuitem"
            type="button"
            className="w-full h-10 px-3 rounded-lg text-left text-sm hover:bg-surface-2"
            onClick={() => {
              navigator.clipboard.writeText(publicKey.toBase58());
              setOpen(false);
            }}
          >
            Copy address
          </button>
          <button
            role="menuitem"
            type="button"
            className="w-full h-10 px-3 rounded-lg text-left text-sm hover:bg-surface-2"
            onClick={() => {
              setOpen(false);
              setVisible(true);
            }}
          >
            Change wallet
          </button>
          <button
            role="menuitem"
            type="button"
            className="w-full h-10 px-3 rounded-lg text-left text-sm text-red hover:bg-surface-2"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

const NAV = [
  { href: "/", label: "Create" },
  { href: "/sent", label: "Gifts sent" },
];

/** `minimal` is the claim page's header: no app nav, sits on the page ground. */
export function Header({ minimal = false }: { minimal?: boolean }) {
  const pathname = usePathname();
  return (
    <header
      className={`h-14 sm:h-16 px-4 sm:px-12 flex items-center justify-between ${
        minimal ? "" : "border-b border-line bg-header-bg"
      }`}
    >
      <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
        <LogoMark />
        <Wordmark />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1.5">
        {!minimal &&
          NAV.map((n) => {
            const current = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={current ? "page" : undefined}
                className={`hidden sm:flex h-11 px-3.5 items-center rounded-[10px] text-sm ${
                  current ? "font-semibold text-ink bg-surface-2" : "font-medium text-ink-2 hover:bg-surface-2"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        <span className="sm:ml-2 flex items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </span>
      </nav>
    </header>
  );
}
