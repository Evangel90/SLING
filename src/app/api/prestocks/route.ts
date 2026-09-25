import { fetchPreStocks } from "@/lib/prestocks";

export const revalidate = 60;

export async function GET() {
  try {
    return Response.json(await fetchPreStocks());
  } catch {
    return Response.json({ error: "PreStocks prices are unavailable right now." }, { status: 502 });
  }
}
