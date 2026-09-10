import { NextResponse } from "next/server";
import { getHospitalReadinessStatus } from "@/lib/compliance/hospital-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  const status = getHospitalReadinessStatus();
  const response = NextResponse.json(status, {
    status: status.hospitalModeRequested && !status.readyForHospitalProduction ? 503 : 200,
  });

  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
