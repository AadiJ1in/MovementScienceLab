import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const response = NextResponse.json({
    ok: true,
    service: "movement-science-lab",
    timestamp: new Date().toISOString(),
  });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
