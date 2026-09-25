"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PreStock } from "@/lib/prestocks";

export function useStocks() {
  const [stocks, setStocks] = useState<PreStock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/prestocks")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "PreStocks prices are unavailable right now.");
        if (alive) setStocks(data);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  return { stocks, error };
}

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div
      role="status"
      className="pg-toast fixed left-1/2 -translate-x-1/2 bottom-10 z-50 h-12 px-4 rounded-[14px] bg-[#16171A] text-white flex items-center gap-2 text-sm font-medium shadow-[0_12px_30px_-10px_rgba(22,23,26,0.45)]"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7EE0A6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      {toast}
    </div>
  ) : null;
  return { show: setToast, node };
}

export function useCopy(show: (msg: string) => void) {
  return useCallback(
    async (text: string, msg = "Link copied") => {
      await navigator.clipboard.writeText(text);
      show(msg);
    },
    [show],
  );
}

export function CopyField({
  label,
  value,
  onCopy,
  primary = true,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  primary?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <span className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="grow min-w-0 h-[52px] px-3.5 rounded-[14px] border border-line bg-field font-mono text-sm"
        />
        <button
          type="button"
          onClick={onCopy}
          className={
            primary
              ? "h-[52px] px-[18px] rounded-[14px] bg-accent hover:bg-accent-hover text-on-accent text-[15px] font-semibold flex items-center gap-2"
              : "h-[52px] px-[18px] rounded-[14px] border border-line bg-surface hover:bg-surface-2 text-[15px] font-semibold flex items-center gap-2"
          }
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="11" height="11" rx="2.5" />
            <path d="M5 15.5V6.5A1.5 1.5 0 0 1 6.5 5h9" />
          </svg>
          Copy
        </button>
      </span>
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "bg-red-bg text-red"
      : tone === "warn"
        ? "bg-amber-bg border border-amber-line"
        : "bg-surface-2";
  return (
    <div role={tone === "error" ? "alert" : "note"} className={`flex gap-3 p-3.5 rounded-[14px] text-sm leading-[1.45] ${cls}`}>
      {children}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

export function walletErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(msg)) return "The request was declined in your wallet. Nothing was sent.";
  if (/insufficient|0x1\b|lamports/i.test(msg)) return "Not enough SOL to cover network fees. Add a little SOL and try again.";
  if (/expired|blockhash/i.test(msg)) return "The network was busy and the transaction expired. Nothing was sent.";
  return msg;
}
