import { ACTIONS_CORS_HEADERS, type ActionsJson } from "@solana/actions";

export function GET() {
  const payload: ActionsJson = {
    rules: [
      // The shareable link (/b?…) maps to the claim action, query string included.
      { pathPattern: "/b", apiPath: "/api/actions/claim" },
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  };
  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export const OPTIONS = GET;
