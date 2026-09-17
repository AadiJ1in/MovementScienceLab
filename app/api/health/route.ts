import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function deploymentProvider() {
  if (process.env.RENDER) return "render";
  if (process.env.VERCEL) return "vercel";
  if (process.env.CI) return "ci";
  return "local";
}

function deploymentRelease() {
  return (
    process.env.RENDER_GIT_COMMIT ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    "unknown"
  );
}

export function GET() {
  const response = NextResponse.json({
    ok: true,
    service: "movement-science-lab",
    provider: deploymentProvider(),
    release: deploymentRelease(),
    timestamp: new Date().toISOString(),
  });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
