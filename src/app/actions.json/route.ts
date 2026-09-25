import { ACTIONS_CORS_HEADERS, type ActionsJson } from "@solana/actions";

export function GET() {
  const payload: ActionsJson = {
    rules: [{ pathPattern: "/api/actions/**", apiPath: "/api/actions/**" }],
  };
  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export const OPTIONS = GET;
