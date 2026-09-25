import { SERVER_RPC_URL } from "@/lib/config";

// Browsers can't use public mainnet RPC and shouldn't see the paid RPC key, so the app proxies
// only the read/send methods it needs.
const ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getLatestBlockhash",
  "getBlockHeight",
  "getEpochInfo",
  "getMinimumBalanceForRentExemption",
  "getParsedTokenAccountsByOwner",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTransaction",
  "getFeeForMessage",
  "isBlockhashValid",
  "simulateTransaction",
  "sendTransaction",
]);

type RpcCall = { method?: unknown };

export async function POST(req: Request) {
  let body: RpcCall | RpcCall[];
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 20 || !calls.every((c) => ALLOWED.has(String(c.method)))) {
    return Response.json({ error: "Method not allowed" }, { status: 403 });
  }

  const upstream = await fetch(SERVER_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
