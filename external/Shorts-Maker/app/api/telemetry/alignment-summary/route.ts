import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { listWorkflowTelemetryEvents } from "@/lib/publish/publish-store";
import { summarizeAlignmentCanary } from "@/lib/telemetry/alignment-canary-summary";

export const runtime = "nodejs";

function parseNumberParam(value: string | null, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

export async function GET(request: NextRequest) {
  try {
    const user = requireSessionUser(request);
    if (!user) return toUnauthorizedApiResponse();

    const limit = parseNumberParam(request.nextUrl.searchParams.get("limit"), 1000, 50, 5000);
    const hours = parseNumberParam(request.nextUrl.searchParams.get("hours"), 24, 1, 24 * 30);
    const events = await listWorkflowTelemetryEvents(user.id, limit);
    const summary = summarizeAlignmentCanary({
      events,
      nowTs: Date.now(),
      hours,
    });

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toApiErrorResponse(message, {
      status: 500,
      errorCode: "TELEMETRY_ALIGNMENT_SUMMARY_FAILED",
      retryable: true,
    });
  }
}
